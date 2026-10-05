-- Soft-close (same URL reopen) + allow in-place snapshot republication.
-- Product: no default expiry; stop sharing instead of revoke; update public content without rotate.

alter table public.share_links
  add column if not exists closed_at timestamptz;

comment on column public.share_links.closed_at is
  'When set, public access is stopped; clearing reopens the same token.';

create index if not exists share_links_closed_at_idx
  on public.share_links (closed_at)
  where closed_at is not null;

-- Open links: drop expiry + passwords so access is owner-controlled via closed_at.
update public.share_links
set
  expires_at = null,
  password_hash = null,
  updated_at = clock_timestamp()
where status = 'active'
  and revoked_at is null;

-- Revoked rows stay immutable; active rows may refresh published snapshot/manifest.
create or replace function public.prevent_revoked_share_link_changes()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status = 'revoked' then
    raise exception 'revoked share links are immutable';
  end if;
  return new;
end;
$$;

create or replace function public.resolve_share_publication_by_hash(p_token_hash text)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object('shareLink', to_jsonb(sl), 'ownerId', v.user_id)
  from public.share_links sl
  join public.viewings v on v.id = sl.viewing_id
  where sl.token_hash = p_token_hash
    and sl.status = 'active'
    and sl.revoked_at is null
    and sl.closed_at is null
    and (sl.expires_at is null or sl.expires_at > clock_timestamp())
    and sl.published_snapshot is not null
    and jsonb_typeof(sl.media_manifest) = 'array'
    and not exists (
      select 1
      from jsonb_array_elements(sl.media_manifest) item
      where jsonb_typeof(item) is distinct from 'object'
        or jsonb_typeof(item -> 'id') is distinct from 'string'
        or jsonb_typeof(item -> 'path') is distinct from 'string'
        or (item ->> 'path') not like v.user_id::text || '/' || v.id::text || '/photos/%'
        or not coalesce((item ->> 'path') = any (v.photo_urls), false)
    )
  limit 1;
$$;

revoke all on function public.resolve_share_publication_by_hash(text) from public, anon, authenticated;
grant execute on function public.resolve_share_publication_by_hash(text) to service_role;

create or replace function public.set_share_link_closed(
  p_link_id uuid,
  p_user_id uuid,
  p_closed boolean
)
returns setof public.share_links
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owned boolean;
begin
  select exists (
    select 1
    from public.share_links sl
    join public.viewings v on v.id = sl.viewing_id
    where sl.id = p_link_id
      and v.user_id = p_user_id
      and sl.status = 'active'
      and sl.revoked_at is null
  ) into v_owned;

  if not v_owned then
    return;
  end if;

  return query
  update public.share_links sl
  set
    closed_at = case when p_closed then coalesce(sl.closed_at, clock_timestamp()) else null end,
    updated_at = clock_timestamp()
  where sl.id = p_link_id
    and sl.status = 'active'
    and sl.revoked_at is null
  returning sl.*;
end;
$$;

revoke all on function public.set_share_link_closed(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_share_link_closed(uuid, uuid, boolean) to service_role;

create or replace function public.republish_share_link(
  p_link_id uuid,
  p_user_id uuid,
  p_snapshot jsonb,
  p_manifest jsonb
)
returns setof public.share_links
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owned boolean;
begin
  if p_snapshot is null or jsonb_typeof(p_snapshot) is distinct from 'object' then
    raise exception 'SHARE_SNAPSHOT_INVALID';
  end if;
  if p_manifest is null or jsonb_typeof(p_manifest) is distinct from 'array' then
    raise exception 'SHARE_MANIFEST_INVALID';
  end if;

  select exists (
    select 1
    from public.share_links sl
    join public.viewings v on v.id = sl.viewing_id
    where sl.id = p_link_id
      and v.user_id = p_user_id
      and sl.status = 'active'
      and sl.revoked_at is null
  ) into v_owned;

  if not v_owned then
    return;
  end if;

  return query
  update public.share_links sl
  set
    published_snapshot = p_snapshot,
    media_manifest = p_manifest,
    updated_at = clock_timestamp()
  where sl.id = p_link_id
    and sl.status = 'active'
    and sl.revoked_at is null
  returning sl.*;
end;
$$;

revoke all on function public.republish_share_link(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.republish_share_link(uuid, uuid, jsonb, jsonb) to service_role;
