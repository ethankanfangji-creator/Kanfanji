-- Additive share-access cutover. share_links becomes the sole share authority.

create extension if not exists "pgcrypto";

-- This migration is intentionally self-bootstrapping: production may already
-- have collaboration/subscriptions while share_links has never been created.
create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  viewing_id uuid not null references public.viewings (id) on delete cascade,
  token text not null unique,
  capability text not null default 'read' check (capability = 'read'),
  status text not null default 'active' check (status in ('active', 'revoked')),
  expires_at timestamptz,
  password_hash text,
  access_version integer not null default 1 check (access_version > 0),
  published_snapshot jsonb,
  media_manifest jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_resolved_at timestamptz
);

alter table public.share_links
  add column if not exists access_version integer not null default 1,
  add column if not exists published_snapshot jsonb,
  add column if not exists media_manifest jsonb not null default '[]'::jsonb;

alter table public.share_links
  drop constraint if exists share_links_published_snapshot_required;
alter table public.share_links
  add constraint share_links_published_snapshot_required
    check (published_snapshot is not null) not valid;
alter table public.share_links
  drop constraint if exists share_links_media_manifest_array;
alter table public.share_links
  add constraint share_links_media_manifest_array
    check (jsonb_typeof(media_manifest) = 'array');

create index if not exists share_links_viewing_id_idx
  on public.share_links (viewing_id);

alter table public.share_links enable row level security;
drop policy if exists "owners select share_links" on public.share_links;
create policy "owners select share_links" on public.share_links
  for select to authenticated
  using (exists (
    select 1 from public.viewings v
    where v.id = viewing_id and v.user_id = (select auth.uid())
  ));
drop policy if exists "owners insert share_links" on public.share_links;
create policy "owners insert share_links" on public.share_links
  for insert to authenticated
  with check (exists (
    select 1 from public.viewings v
    where v.id = viewing_id and v.user_id = (select auth.uid())
  ));
drop policy if exists "owners update share_links" on public.share_links;
create policy "owners update share_links" on public.share_links
  for update to authenticated
  using (exists (
    select 1 from public.viewings v
    where v.id = viewing_id and v.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.viewings v
    where v.id = viewing_id and v.user_id = (select auth.uid())
  ));
revoke all on public.share_links from public, anon;
grant select, insert, update on public.share_links to authenticated;
grant all on public.share_links to service_role;

-- Expiry is derived from expires_at; normalize the draft migration's stored value.
update public.share_links
set status = 'active'
where status = 'expired' and revoked_at is null;

alter table public.share_links
  drop constraint if exists share_links_status_check;
alter table public.share_links
  add constraint share_links_status_check check (status in ('active', 'revoked'));
alter table public.share_links
  add constraint share_links_access_version_check check (access_version > 0);

create unique index if not exists share_links_one_active_per_viewing_uidx
  on public.share_links (viewing_id)
  where status = 'active' and revoked_at is null;

create or replace function public.prevent_revoked_share_link_changes()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status = 'revoked' then
    raise exception 'revoked share links are immutable';
  end if;
  if new.published_snapshot is distinct from old.published_snapshot
     or new.media_manifest is distinct from old.media_manifest then
    raise exception 'published share snapshot is immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_revoked_share_link_changes() from public;
revoke all on function public.prevent_revoked_share_link_changes() from anon, authenticated;

drop trigger if exists share_links_preserve_history on public.share_links;
create trigger share_links_preserve_history
before update on public.share_links
for each row execute function public.prevent_revoked_share_link_changes();

create or replace function public.rotate_share_link(
  p_link_id uuid,
  p_user_id uuid,
  p_token text
)
returns setof public.share_links
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old public.share_links;
begin
  select sl.* into v_old
  from public.share_links sl
  join public.viewings v on v.id = sl.viewing_id
  where sl.id = p_link_id
    and sl.status = 'active'
    and sl.revoked_at is null
    and v.user_id = p_user_id
  for update of sl;

  if not found then
    return;
  end if;

  update public.share_links
  set status = 'revoked',
      revoked_at = now(),
      updated_at = now(),
      access_version = access_version + 1
  where id = v_old.id;

  return query
  insert into public.share_links (
    viewing_id,
    token,
    capability,
    status,
    expires_at,
    password_hash,
    access_version,
    published_snapshot,
    media_manifest
  )
  values (
    v_old.viewing_id,
    p_token,
    'read',
    'active',
    v_old.expires_at,
    v_old.password_hash,
    1,
    v_old.published_snapshot,
    v_old.media_manifest
  )
  returning *;
end;
$$;

revoke all on function public.rotate_share_link(uuid, uuid, text) from public;
revoke all on function public.rotate_share_link(uuid, uuid, text) from anon, authenticated;
grant execute on function public.rotate_share_link(uuid, uuid, text) to service_role;

create table if not exists public.share_unlock_limits (
  key_hash text primary key,
  window_started_at timestamptz not null,
  attempts integer not null check (attempts >= 0),
  updated_at timestamptz not null default now()
);

alter table public.share_unlock_limits enable row level security;
revoke all on public.share_unlock_limits from public, anon, authenticated;
grant all on public.share_unlock_limits to service_role;

create or replace function public.consume_share_unlock_attempt(p_key text)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window constant interval := interval '15 minutes';
  v_limit constant integer := 10;
  v_row public.share_unlock_limits;
begin
  if p_key is null or length(p_key) <> 64 then
    raise exception 'invalid rate-limit key';
  end if;

  insert into public.share_unlock_limits (key_hash, window_started_at, attempts, updated_at)
  values (p_key, v_now, 1, v_now)
  on conflict (key_hash) do update
  set window_started_at = case
        when public.share_unlock_limits.window_started_at + v_window <= v_now
          then v_now
        else public.share_unlock_limits.window_started_at
      end,
      attempts = case
        when public.share_unlock_limits.window_started_at + v_window <= v_now
          then 1
        else public.share_unlock_limits.attempts + 1
      end,
      updated_at = v_now
  returning * into v_row;

  allowed := v_row.attempts <= v_limit;
  retry_after_seconds := case
    when allowed then 0
    else greatest(
      1,
      ceil(extract(epoch from (v_row.window_started_at + v_window - v_now)))::integer
    )
  end;
  return next;
end;
$$;

revoke all on function public.consume_share_unlock_attempt(text) from public;
revoke all on function public.consume_share_unlock_attempt(text) from anon, authenticated;
grant execute on function public.consume_share_unlock_attempt(text) to service_role;

-- The app uses server-side table access and cannot bypass password gating.
drop function if exists public.resolve_share_link(text);
drop function if exists public.get_viewing_by_share_token(text);
