-- Baseline: converged prod-shaped schema (from supabase/schema.sql).
-- Fresh local: applied by `supabase db reset`.
-- Existing remotes: `supabase migration repair 20250901000000 --status applied`
-- then only push newer migrations. Do not re-run this on prod/dev that already have tables.

create extension if not exists "pgcrypto";

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  normalized_address text not null,
  lat double precision,
  lng double precision,
  year_built integer,
  zoning text,
  view_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint properties_normalized_address_key unique (normalized_address)
);

create index if not exists properties_lat_lng_idx
  on public.properties (lat, lng)
  where lat is not null and lng is not null;

alter table public.properties enable row level security;

drop policy if exists "anyone can read properties" on public.properties;
create policy "anyone can read properties"
  on public.properties for select
  to anon, authenticated
  using (true);

revoke all privileges on table public.properties from public, anon, authenticated;
grant all on public.properties to service_role;

create table if not exists public.viewings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key text,
  revision integer not null default 1 check (revision > 0),
  address text not null,
  tags text[] not null default '{}',
  market text,
  questions jsonb not null default '[]'::jsonb,
  photo_urls text[] not null default '{}',
  video_urls text[] not null default '{}',
  audio_urls text[] not null default '{}',
  notes jsonb not null default '[]'::jsonb,
  pros text[] not null default '{}',
  risks text[] not null default '{}',
  share_token text,
  client_updated_at timestamptz,
  property jsonb not null default '{}'::jsonb,
  is_pro boolean not null default false,
  property_id uuid references public.properties (id) on delete set null,
  messages jsonb not null default '[]'::jsonb,
  report jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists viewings_share_token_uidx
  on public.viewings (share_token)
  where share_token is not null;

create index if not exists viewings_user_id_idx on public.viewings (user_id);
create unique index if not exists viewings_owner_idempotency_uidx
  on public.viewings (user_id, idempotency_key);
create index if not exists viewings_property_id_idx on public.viewings (property_id);

alter table public.viewings enable row level security;

drop policy if exists "users can select own viewings" on public.viewings;
create policy "users can select own viewings"
  on public.viewings for select to authenticated
  using ((select auth.uid()) = user_id);

-- Inserts go through POST /api/viewings (service role) so free-tier / Pro can be enforced server-side.
-- Do not recreate an authenticated INSERT policy here.

drop policy if exists "users can update own viewings" on public.viewings;
create policy "users can update own viewings"
  on public.viewings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users can delete own viewings" on public.viewings;
create policy "users can delete own viewings"
  on public.viewings for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all privileges on table public.viewings from public, anon, authenticated;
grant insert (
  user_id, idempotency_key, revision, address, tags, market, questions,
  photo_urls, video_urls, audio_urls, notes, pros, risks, client_updated_at,
  property, is_pro, property_id, updated_at
) on table public.viewings to authenticated;
grant update (
  user_id, revision, address, tags, market, questions,
  notes, pros, risks, client_updated_at, property,
  updated_at
) on table public.viewings to authenticated;
grant select (
  id, user_id, property_id, idempotency_key, revision, address, tags, market,
  questions, pros, risks, photo_urls, video_urls, client_updated_at, is_pro,
  created_at, updated_at
) on table public.viewings to authenticated;
grant all privileges on table public.viewings to service_role;

create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  viewing_id uuid not null references public.viewings (id) on delete cascade,
  token text not null unique,
  capability text not null default 'read' check (capability = 'read'),
  status text not null default 'active' check (status in ('active', 'revoked')),
  expires_at timestamptz,
  password_hash text,
  access_version integer not null default 1 check (access_version > 0),
  published_snapshot jsonb not null,
  media_manifest jsonb not null default '[]'::jsonb
    check (jsonb_typeof(media_manifest) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_resolved_at timestamptz
);

create index if not exists share_links_viewing_id_idx
  on public.share_links (viewing_id);
create unique index if not exists share_links_one_active_per_viewing_uidx
  on public.share_links (viewing_id)
  where status = 'active' and revoked_at is null;

alter table public.share_links enable row level security;

create policy "owners select share_links"
  on public.share_links for select to authenticated
  using (
    exists (
      select 1 from public.viewings v
      where v.id = viewing_id and v.user_id = (select auth.uid())
    )
  );
create policy "owners insert share_links"
  on public.share_links for insert to authenticated
  with check (
    exists (
      select 1 from public.viewings v
      where v.id = viewing_id and v.user_id = (select auth.uid())
    )
  );
create policy "owners update share_links"
  on public.share_links for update to authenticated
  using (
    exists (
      select 1 from public.viewings v
      where v.id = viewing_id and v.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.viewings v
      where v.id = viewing_id and v.user_id = (select auth.uid())
    )
  );

revoke all on public.share_links from anon;
grant select, insert, update on public.share_links to authenticated;
grant all on public.share_links to service_role;

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
  if not found then return; end if;

  update public.share_links
  set status = 'revoked',
      revoked_at = now(),
      updated_at = now(),
      access_version = access_version + 1
  where id = v_old.id;

  return query
  insert into public.share_links (
    viewing_id, token, capability, status, expires_at, password_hash, access_version,
    published_snapshot, media_manifest
  )
  values (
    v_old.viewing_id, p_token, 'read', 'active',
    v_old.expires_at, v_old.password_hash, 1,
    v_old.published_snapshot, v_old.media_manifest
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
drop policy if exists "deny client access to share unlock limits"
  on public.share_unlock_limits;
create policy "deny client access to share unlock limits"
  on public.share_unlock_limits
  for all
  to anon, authenticated
  using (false)
  with check (false);
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
        when public.share_unlock_limits.window_started_at + v_window <= v_now then v_now
        else public.share_unlock_limits.window_started_at
      end,
      attempts = case
        when public.share_unlock_limits.window_started_at + v_window <= v_now then 1
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

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text unique,
  status text not null default 'inactive',
  plan text,
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_stripe_customer_id_idx
  on public.subscriptions (stripe_customer_id);

alter table public.subscriptions enable row level security;

drop policy if exists "users can select own subscription" on public.subscriptions;
create policy "users can select own subscription"
  on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all privileges on table public.subscriptions from public, anon, authenticated;
grant select (user_id, status, plan) on table public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;

insert into storage.buckets (id, name, public)
values ('viewing-media', 'viewing-media', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "users can upload own viewing media" on storage.objects;
create policy "users can upload own viewing media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'viewing-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "users can update own viewing media" on storage.objects;
create policy "users can update own viewing media"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'viewing-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'viewing-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "public can read viewing media" on storage.objects;

drop policy if exists "users can read own viewing media" on storage.objects;
create policy "users can read own viewing media"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'viewing-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create or replace function public.find_or_create_property(
  p_normalized_address text,
  p_lat double precision,
  p_lng double precision,
  p_zoning text default null,
  p_year_built integer default null
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_norm text := pg_catalog.lower(pg_catalog.btrim(p_normalized_address));
begin
  if v_norm is null
    or pg_catalog.char_length(v_norm) < 3
    or pg_catalog.char_length(v_norm) > 500
    or v_norm ~ '[[:cntrl:]]'
  then
    raise exception using
      errcode = '22023',
      message = 'invalid normalized_address';
  end if;

  if (p_lat is null) <> (p_lng is null)
    or (p_lat is not null and (p_lat < -90 or p_lat > 90 or p_lat = 'NaN'::double precision))
    or (p_lng is not null and (p_lng < -180 or p_lng > 180 or p_lng = 'NaN'::double precision))
  then
    raise exception using
      errcode = '22023',
      message = 'invalid coordinates';
  end if;

  if p_year_built is not null
    and (
      p_year_built < 1000
      or p_year_built > pg_catalog.date_part('year', pg_catalog.now())::integer + 5
    )
  then
    raise exception using
      errcode = '22023',
      message = 'invalid year_built';
  end if;

  insert into public.properties (
    normalized_address, lat, lng, zoning, year_built, view_count
  )
  values (v_norm, p_lat, p_lng, p_zoning, p_year_built, 1)
  on conflict (normalized_address) do update
    set view_count = public.properties.view_count + 1,
        updated_at = pg_catalog.now(),
        zoning = coalesce(public.properties.zoning, excluded.zoning),
        year_built = coalesce(public.properties.year_built, excluded.year_built),
        lat = coalesce(public.properties.lat, excluded.lat),
        lng = coalesce(public.properties.lng, excluded.lng)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.find_or_create_property(text, double precision, double precision, text, integer)
  from public, anon, authenticated;
grant execute on function public.find_or_create_property(text, double precision, double precision, text, integer)
  to service_role;

-- Server-only, multi-dimensional AI quota accounting.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.ai_quota_windows (
  quota_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);
revoke all on private.ai_quota_windows from public, anon, authenticated;
grant select, insert, update, delete on private.ai_quota_windows to service_role;

create or replace function public.consume_ai_quota_internal(
  p_keys text[],
  p_limits integer[],
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_index integer;
  v_retry integer := 0;
  v_row private.ai_quota_windows%rowtype;
begin
  if coalesce(array_length(p_keys, 1), 0) < 1
     or array_length(p_keys, 1) <> array_length(p_limits, 1)
     or array_length(p_keys, 1) > 5
     or p_window_seconds < 60
     or p_window_seconds > 2592000 then
    raise exception 'invalid quota arguments';
  end if;
  for v_index in 1..array_length(p_keys, 1) loop
    if p_keys[v_index] is null or length(p_keys[v_index]) > 160
       or p_limits[v_index] < 1 or p_limits[v_index] > 10000 then
      raise exception 'invalid quota dimension';
    end if;
    insert into private.ai_quota_windows (quota_key, window_started_at, request_count)
    values (p_keys[v_index], v_now, 0)
    on conflict (quota_key) do nothing;
  end loop;
  perform 1 from private.ai_quota_windows
  where quota_key = any(p_keys) order by quota_key for update;
  update private.ai_quota_windows
  set window_started_at = v_now, request_count = 0, updated_at = v_now
  where quota_key = any(p_keys)
    and window_started_at + make_interval(secs => p_window_seconds) <= v_now;
  for v_index in 1..array_length(p_keys, 1) loop
    select * into strict v_row from private.ai_quota_windows
    where quota_key = p_keys[v_index];
    if v_row.request_count >= p_limits[v_index] then
      v_retry := greatest(v_retry, ceil(extract(epoch from (
        v_row.window_started_at + make_interval(secs => p_window_seconds) - v_now
      )))::integer);
    end if;
  end loop;
  if v_retry > 0 then
    return query select false, greatest(v_retry, 1);
    return;
  end if;
  update private.ai_quota_windows
  set request_count = request_count + 1, updated_at = v_now
  where quota_key = any(p_keys);
  return query select true, 0;
end;
$$;
revoke all on function public.consume_ai_quota_internal(text[], integer[], integer) from public;
revoke all on function public.consume_ai_quota_internal(text[], integer[], integer) from anon, authenticated;
grant execute on function public.consume_ai_quota_internal(text[], integer[], integer) to service_role;

-- Billing webhook ordering/ledger (server-only).
alter table public.subscriptions
  add column if not exists last_stripe_event_created bigint,
  add column if not exists last_stripe_event_rank integer not null default 0,
  add column if not exists last_stripe_event_id text;

create table if not exists private.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  event_created bigint not null check (event_created >= 0),
  outcome text not null check (outcome in ('applied', 'ignored')),
  received_at timestamptz not null default clock_timestamp()
);
revoke all on private.stripe_webhook_events from public, anon, authenticated;
grant select, insert on private.stripe_webhook_events to service_role;
create index if not exists stripe_webhook_events_received_at_idx
  on private.stripe_webhook_events (received_at);

create or replace function public.process_stripe_subscription_event(
  p_event_id text,
  p_event_type text,
  p_event_created bigint,
  p_user_id uuid default null,
  p_customer_id text default null,
  p_status text default null,
  p_plan text default null
)
returns table (outcome text)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_current public.subscriptions%rowtype;
  v_active boolean;
begin
  if p_event_id is null or length(p_event_id) > 255
     or p_event_type is null or length(p_event_type) > 255
     or p_event_created is null or p_event_created < 0 then
    raise exception 'invalid stripe event';
  end if;
  insert into private.stripe_webhook_events (
    event_id, event_type, event_created, outcome
  ) values (p_event_id, p_event_type, p_event_created, 'ignored')
  on conflict (event_id) do nothing;
  if not found then
    return query select 'duplicate'::text;
    return;
  end if;
  if p_user_id is null or p_status is null then
    return query select 'ignored'::text;
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into v_current from public.subscriptions
  where user_id = p_user_id for update;
  if found and v_current.last_stripe_event_created > p_event_created then
    return query select 'out_of_order'::text;
    return;
  end if;
  v_active := p_status in ('active', 'trialing');
  insert into public.subscriptions (
    user_id, stripe_customer_id, status, plan, updated_at,
    last_stripe_event_created, last_stripe_event_id
  ) values (
    p_user_id, p_customer_id, p_status,
    case when v_active then p_plan else null end,
    clock_timestamp(), p_event_created, p_event_id
  )
  on conflict (user_id) do update
  set stripe_customer_id = coalesce(excluded.stripe_customer_id, public.subscriptions.stripe_customer_id),
      status = excluded.status,
      plan = excluded.plan,
      updated_at = excluded.updated_at,
      last_stripe_event_created = excluded.last_stripe_event_created,
      last_stripe_event_id = excluded.last_stripe_event_id;
  update public.viewings set is_pro = v_active
  where user_id = p_user_id and is_pro is distinct from v_active;
  update private.stripe_webhook_events set outcome = 'applied'
  where event_id = p_event_id;
  return query select 'applied'::text;
end;
$$;
revoke all on function public.process_stripe_subscription_event(
  text, text, bigint, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.process_stripe_subscription_event(
  text, text, bigint, uuid, text, text, text
) to service_role;

-- Collaboration tables/RLS and all post-release forward fixes are composed
-- from the ordered migration list in docs/release-migration-runbook.md.
