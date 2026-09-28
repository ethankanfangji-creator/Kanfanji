-- Per-dimension AI quota windows. 0 seconds means lifetime (never reset).
-- Does not drop consume_ai_quota_internal or alter private.ai_quota_windows.

create or replace function public.consume_ai_quota_v2(
  p_keys text[],
  p_limits integer[],
  p_window_seconds integer[]
)
returns table (allowed boolean, blocked_index integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer := coalesce(array_length(p_keys, 1), 0);
  v_index integer;
  v_blocked integer := null;
  v_retry integer := null;
  v_row private.ai_quota_windows%rowtype;
  v_window integer;
begin
  if v_count < 1
     or v_count > 5
     or v_count <> coalesce(array_length(p_limits, 1), 0)
     or v_count <> coalesce(array_length(p_window_seconds, 1), 0) then
    raise exception 'invalid quota arguments';
  end if;

  for v_index in 1..v_count loop
    v_window := p_window_seconds[v_index];
    if p_keys[v_index] is null
       or length(p_keys[v_index]) > 160
       or p_keys[v_index] = any(p_keys[1:v_index - 1])
       or p_limits[v_index] < 1
       or p_limits[v_index] > 10000
       or v_window is null
       or (v_window <> 0 and (v_window < 60 or v_window > 2592000)) then
      raise exception 'invalid quota dimension';
    end if;
    insert into private.ai_quota_windows (quota_key, window_started_at, request_count)
    values (p_keys[v_index], v_now, 0)
    on conflict (quota_key) do nothing;
  end loop;

  perform 1
  from private.ai_quota_windows
  where quota_key = any(p_keys)
  order by quota_key
  for update;

  for v_index in 1..v_count loop
    v_window := p_window_seconds[v_index];
    if v_window > 0 then
      update private.ai_quota_windows
      set window_started_at = v_now,
          request_count = 0,
          updated_at = v_now
      where quota_key = p_keys[v_index]
        and window_started_at + make_interval(secs => v_window) <= v_now;
    end if;
  end loop;

  for v_index in 1..v_count loop
    select * into strict v_row
    from private.ai_quota_windows
    where quota_key = p_keys[v_index];
    if v_row.request_count >= p_limits[v_index] and v_blocked is null then
      v_blocked := v_index;
    end if;
    v_window := p_window_seconds[v_index];
    if v_row.request_count >= p_limits[v_index] and v_window > 0 then
      v_retry := greatest(
        coalesce(v_retry, 0),
        ceil(extract(epoch from (
          v_row.window_started_at + make_interval(secs => v_window) - v_now
        )))::integer
      );
    end if;
  end loop;

  if v_blocked is not null then
    return query select false, v_blocked, case when v_retry is null then null else greatest(v_retry, 1) end;
    return;
  end if;

  update private.ai_quota_windows
  set request_count = request_count + 1,
      updated_at = v_now
  where quota_key = any(p_keys);

  return query select true, null::integer, 0;
end;
$$;

revoke all on function public.consume_ai_quota_v2(text[], integer[], integer[]) from public;
revoke all on function public.consume_ai_quota_v2(text[], integer[], integer[]) from anon, authenticated;
grant execute on function public.consume_ai_quota_v2(text[], integer[], integer[]) to service_role;
