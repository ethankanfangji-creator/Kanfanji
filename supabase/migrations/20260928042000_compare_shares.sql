create table if not exists public.compare_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  compare_id uuid not null references public.compare_usage(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  snapshot jsonb,
  snapshot_version smallint not null default 2,
  column_count smallint not null check (column_count between 2 and 5),
  status text not null default 'active' check (status in ('active','revoked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint compare_shares_active_has_snapshot check (status <> 'active' or snapshot is not null),
  constraint compare_shares_snapshot_size check (snapshot is null or pg_column_size(snapshot) <= 65536)
);

create unique index if not exists compare_shares_one_active_per_compare
  on public.compare_shares (compare_id) where status = 'active';
create index if not exists compare_shares_user_created_idx
  on public.compare_shares (user_id, created_at desc);

alter table public.compare_shares enable row level security;
revoke all on public.compare_shares from public, anon, authenticated;
grant select (id, compare_id, status, column_count, expires_at, created_at, revoked_at, user_id)
  on public.compare_shares to authenticated;
create policy "owners select compare_shares" on public.compare_shares
  for select to authenticated
  using (user_id = (select auth.uid()));
grant update (status, revoked_at) on public.compare_shares to authenticated;
create policy "owners revoke compare_shares" on public.compare_shares
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and status = 'revoked');

create or replace function public.prevent_compare_share_changes()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'revoked' and new.status <> 'revoked' then
      raise exception 'revoked compare share cannot be reactivated';
    end if;
    if new.token_hash is distinct from old.token_hash
       or new.user_id is distinct from old.user_id
       or new.compare_id is distinct from old.compare_id
       or new.expires_at is distinct from old.expires_at then
      raise exception 'compare share identity cannot change';
    end if;
    if new.status = 'revoked' and old.status is distinct from 'revoked' then
      new.snapshot := null;
      new.revoked_at := coalesce(new.revoked_at, now());
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists compare_shares_protect on public.compare_shares;
create trigger compare_shares_protect
  before update on public.compare_shares
  for each row execute function public.prevent_compare_share_changes();

grant select, insert, update, delete on public.compare_shares to service_role;

create or replace function public.create_compare_share(
  p_user_id uuid,
  p_compare_id uuid,
  p_token_hash text,
  p_snapshot jsonb,
  p_column_count int,
  p_is_pro boolean,
  p_free_max int,
  p_pro_max int,
  p_ttl_seconds int,
  p_hourly_cap int,
  p_active_cap int
)
returns table (outcome text, share_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_usage public.compare_usage%rowtype;
  v_recent integer;
  v_active integer;
  v_expires timestamptz;
  v_id uuid;
  v_max integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('compare:' || p_user_id::text, 0));
  select * into v_usage from public.compare_usage where id = p_compare_id and user_id = p_user_id;
  if v_usage.id is null then
    return query select 'not_found', null::uuid, null::timestamptz;
    return;
  end if;
  v_max := case when p_is_pro then p_pro_max else p_free_max end;
  if not p_is_pro and not v_usage.is_free_slot then
    return query select 'upgrade_required', null::uuid, null::timestamptz;
    return;
  end if;
  if p_column_count > v_usage.item_count or p_column_count > v_max then
    return query select 'too_many_items', null::uuid, null::timestamptz;
    return;
  end if;
  select count(*) into v_recent from public.compare_shares
    where user_id = p_user_id and created_at > clock_timestamp() - interval '1 hour';
  select count(*) into v_active from public.compare_shares
    where user_id = p_user_id and status = 'active' and expires_at > clock_timestamp();
  if v_recent >= p_hourly_cap or v_active >= p_active_cap then
    return query select 'rate_limited', null::uuid, null::timestamptz;
    return;
  end if;
  update public.compare_shares
  set status = 'revoked', revoked_at = clock_timestamp(), snapshot = null
  where compare_id = p_compare_id and status = 'active';
  v_expires := clock_timestamp() + make_interval(secs => p_ttl_seconds);
  insert into public.compare_shares (user_id, compare_id, token_hash, snapshot, column_count, expires_at)
  values (p_user_id, p_compare_id, p_token_hash, p_snapshot, p_column_count, v_expires)
  returning id into v_id;
  return query select 'created', v_id, v_expires;
end;
$$;

revoke all on function public.create_compare_share(uuid, uuid, text, jsonb, integer, boolean, integer, integer, integer, integer, integer) from public;
revoke all on function public.create_compare_share(uuid, uuid, text, jsonb, integer, boolean, integer, integer, integer, integer, integer) from anon, authenticated;
grant execute on function public.create_compare_share(uuid, uuid, text, jsonb, integer, boolean, integer, integer, integer, integer, integer) to service_role;
