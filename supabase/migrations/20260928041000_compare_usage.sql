create table if not exists public.compare_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  compare_key text not null check (compare_key ~ '^[a-f0-9]{64}$'),
  item_count smallint not null check (item_count between 2 and 5),
  source text not null check (source in ('chat_history','viewings_list')),
  is_free_slot boolean not null default false,
  created_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now(),
  constraint compare_usage_user_key unique (user_id, compare_key)
);

create unique index if not exists compare_usage_one_free_slot
  on public.compare_usage (user_id) where is_free_slot;

alter table public.compare_usage enable row level security;
revoke all on public.compare_usage from public, anon, authenticated;
grant select, insert, update, delete on public.compare_usage to service_role;

create or replace function public.start_compare_session(
  p_user_id uuid,
  p_compare_key text,
  p_item_count int,
  p_source text,
  p_is_pro boolean,
  p_free_max int,
  p_pro_max int,
  p_daily_new_cap int
)
returns table (outcome text, compare_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing public.compare_usage%rowtype;
  v_any boolean;
  v_recent integer;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('compare:' || p_user_id::text, 0));

  select * into v_existing
  from public.compare_usage
  where user_id = p_user_id and compare_key = p_compare_key;

  select exists (
    select 1 from public.compare_usage where user_id = p_user_id
  ) into v_any;

  if not p_is_pro then
    if v_existing.id is not null and v_existing.is_free_slot then
      if p_item_count > p_free_max then
        return query select 'too_many_items', v_existing.id;
        return;
      end if;
      update public.compare_usage
      set last_opened_at = clock_timestamp()
      where id = v_existing.id;
      return query select 'reopened', v_existing.id;
      return;
    end if;
    if v_any then
      return query select 'upgrade_required', null::uuid;
      return;
    end if;
    if p_item_count > p_free_max then
      return query select 'too_many_items', null::uuid;
      return;
    end if;
    insert into public.compare_usage (user_id, compare_key, item_count, source, is_free_slot)
    values (p_user_id, p_compare_key, p_item_count, p_source, true)
    returning id into v_id;
    return query select 'created', v_id;
    return;
  end if;

  if p_item_count > p_pro_max then
    return query select 'too_many_items', v_existing.id;
    return;
  end if;
  if v_existing.id is not null then
    update public.compare_usage
    set last_opened_at = clock_timestamp()
    where id = v_existing.id;
    return query select 'reopened', v_existing.id;
    return;
  end if;

  select count(*) into v_recent
  from public.compare_usage
  where user_id = p_user_id
    and created_at > clock_timestamp() - interval '24 hours';
  if v_recent >= p_daily_new_cap then
    return query select 'rate_limited', null::uuid;
    return;
  end if;

  insert into public.compare_usage (user_id, compare_key, item_count, source, is_free_slot)
  values (p_user_id, p_compare_key, p_item_count, p_source, false)
  returning id into v_id;
  return query select 'created', v_id;
end;
$$;

revoke all on function public.start_compare_session(uuid, text, integer, text, boolean, integer, integer, integer) from public;
revoke all on function public.start_compare_session(uuid, text, integer, text, boolean, integer, integer, integer) from anon, authenticated;
grant execute on function public.start_compare_session(uuid, text, integer, text, boolean, integer, integer, integer) to service_role;
