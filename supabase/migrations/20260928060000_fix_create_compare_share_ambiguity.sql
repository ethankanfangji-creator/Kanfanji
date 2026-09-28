-- Forward fix only. The applied function's OUT column expires_at collided
-- with compare_shares.expires_at. Do not edit 20260928042000_compare_shares.sql.

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
  select cu.* into v_usage
  from public.compare_usage cu
  where cu.id = p_compare_id and cu.user_id = p_user_id;
  if v_usage.id is null then
    return query select 'not_found'::text, null::uuid, null::timestamptz;
    return;
  end if;
  v_max := case when p_is_pro then p_pro_max else p_free_max end;
  if not p_is_pro and not v_usage.is_free_slot then
    return query select 'upgrade_required'::text, null::uuid, null::timestamptz;
    return;
  end if;
  if p_column_count > v_usage.item_count or p_column_count > v_max then
    return query select 'too_many_items'::text, null::uuid, null::timestamptz;
    return;
  end if;
  select count(*) into v_recent
  from public.compare_shares cs
  where cs.user_id = p_user_id
    and cs.created_at > clock_timestamp() - interval '1 hour';
  select count(*) into v_active
  from public.compare_shares cs
  where cs.user_id = p_user_id
    and cs.status = 'active'
    and cs.expires_at > clock_timestamp();
  if v_recent >= p_hourly_cap or v_active >= p_active_cap then
    return query select 'rate_limited'::text, null::uuid, null::timestamptz;
    return;
  end if;
  update public.compare_shares cs
  set (status, revoked_at, snapshot) = ('revoked', clock_timestamp(), null)
  where cs.compare_id = p_compare_id
    and cs.status = 'active';
  v_expires := clock_timestamp() + make_interval(secs => p_ttl_seconds);
  insert into public.compare_shares as cs (user_id, compare_id, token_hash, snapshot, column_count, expires_at)
  values (p_user_id, p_compare_id, p_token_hash, p_snapshot, p_column_count, v_expires)
  returning cs.id into v_id;
  return query select 'created'::text, v_id, v_expires;
end;
$$;

revoke all on function public.create_compare_share(uuid, uuid, text, jsonb, integer, boolean, integer, integer, integer, integer, integer) from public;
revoke all on function public.create_compare_share(uuid, uuid, text, jsonb, integer, boolean, integer, integer, integer, integer, integer) from anon, authenticated;
grant execute on function public.create_compare_share(uuid, uuid, text, jsonb, integer, boolean, integer, integer, integer, integer, integer) to service_role;
