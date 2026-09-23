-- Atomic server-only AI quota windows. Apply on both dev and prod.
-- Day boundary: rolling window of p_window_seconds (app default 86400) from
-- window_started_at (timestamptz / UTC). Not calendar midnight.
-- Writes only via service_role RPC; anon/authenticated have no table access.
-- Subject limits (guest/free/pro) are chosen in app code (lib/ai-quota.ts) and
-- passed as p_limits — never trust client isPro.
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
    if p_keys[v_index] is null
       or length(p_keys[v_index]) > 160
       or p_limits[v_index] < 1
       or p_limits[v_index] > 10000 then
      raise exception 'invalid quota dimension';
    end if;
    insert into private.ai_quota_windows (quota_key, window_started_at, request_count)
    values (p_keys[v_index], v_now, 0)
    on conflict (quota_key) do nothing;
  end loop;

  -- Lock in a stable order so overlapping multi-dimensional requests cannot deadlock.
  perform 1
  from private.ai_quota_windows
  where quota_key = any(p_keys)
  order by quota_key
  for update;

  update private.ai_quota_windows
  set window_started_at = v_now,
      request_count = 0,
      updated_at = v_now
  where quota_key = any(p_keys)
    and window_started_at + make_interval(secs => p_window_seconds) <= v_now;

  for v_index in 1..array_length(p_keys, 1) loop
    select * into strict v_row
    from private.ai_quota_windows
    where quota_key = p_keys[v_index];
    if v_row.request_count >= p_limits[v_index] then
      v_retry := greatest(
        v_retry,
        ceil(extract(epoch from (
          v_row.window_started_at + make_interval(secs => p_window_seconds) - v_now
        )))::integer
      );
    end if;
  end loop;

  if v_retry > 0 then
    return query select false, greatest(v_retry, 1);
    return;
  end if;

  update private.ai_quota_windows
  set request_count = request_count + 1,
      updated_at = v_now
  where quota_key = any(p_keys);

  return query select true, 0;
end;
$$;

revoke all on function public.consume_ai_quota_internal(text[], integer[], integer) from public;
revoke all on function public.consume_ai_quota_internal(text[], integer[], integer) from anon, authenticated;
grant execute on function public.consume_ai_quota_internal(text[], integer[], integer) to service_role;
