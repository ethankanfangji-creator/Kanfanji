-- Minimal admin backend: manual Pro, AI quota reset, and an append-only audit log.
-- Service role only. Stripe upserts do not mention the manual_pro_* columns.

alter table public.subscriptions
  add column if not exists manual_pro_until timestamptz,
  add column if not exists manual_pro_reason text,
  add column if not exists manual_pro_granted_by uuid;

grant select (manual_pro_until) on table public.subscriptions to authenticated;

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  target_user_id uuid,
  action text not null check (
    action in ('pro_grant', 'pro_revoke', 'ai_quota_reset', 'user_ban', 'user_unban')
  ),
  before jsonb not null default '{}'::jsonb,
  after jsonb not null default '{}'::jsonb,
  reason text not null check (char_length(reason) between 3 and 500),
  outcome text not null default 'succeeded' check (
    outcome in ('requested', 'succeeded', 'failed')
  ),
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_target_created_idx
  on public.admin_audit_log (target_user_id, created_at desc);

alter table public.admin_audit_log enable row level security;

drop policy if exists "deny client access to admin audit log" on public.admin_audit_log;
create policy "deny client access to admin audit log"
  on public.admin_audit_log
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on public.admin_audit_log from public, anon, authenticated;
grant select, insert on public.admin_audit_log to service_role;

create or replace function public.prevent_admin_audit_log_changes()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'admin audit log is append-only';
end;
$$;

revoke all on function public.prevent_admin_audit_log_changes() from public, anon, authenticated;

drop trigger if exists admin_audit_log_append_only on public.admin_audit_log;
create trigger admin_audit_log_append_only
before update or delete on public.admin_audit_log
for each row execute function public.prevent_admin_audit_log_changes();

create or replace function public.admin_list_users(
  p_query text,
  p_limit integer,
  p_offset integer
)
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  banned_until timestamptz,
  subscription_status text,
  subscription_plan text,
  manual_pro_until timestamptz,
  viewing_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_query text := nullif(pg_catalog.btrim(p_query), '');
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_pattern text;
begin
  if v_query is not null then
    v_pattern :=
      '%' ||
      replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') ||
      '%';
  end if;

  return query
  select
    u.id,
    u.email::text,
    u.created_at,
    u.last_sign_in_at,
    u.banned_until,
    s.status,
    s.plan,
    s.manual_pro_until,
    (
      select count(*)
      from public.viewings v
      where v.user_id = u.id
    )
  from auth.users u
  left join public.subscriptions s on s.user_id = u.id
  where v_query is null
    or u.email::text ilike v_pattern escape '\'
    or (
      v_query ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      and u.id = v_query::uuid
    )
  order by u.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

create or replace function public.admin_get_ai_usage(p_keys text[])
returns table (
  quota_key text,
  request_count integer,
  window_started_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if coalesce(array_length(p_keys, 1), 0) > 100 then
    raise exception 'too many quota keys';
  end if;
  return query
  select w.quota_key, w.request_count, w.window_started_at
  from private.ai_quota_windows w
  where w.quota_key = any(p_keys);
end;
$$;

create or replace function public.admin_reset_ai_quota(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_keys text[],
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_before integer;
begin
  if p_reason is null or char_length(p_reason) < 3 or char_length(p_reason) > 500 then
    raise exception 'invalid reason';
  end if;
  if coalesce(array_length(p_keys, 1), 0) < 1 or array_length(p_keys, 1) > 20 then
    raise exception 'invalid quota keys';
  end if;

  select coalesce(sum(request_count), 0)
  into v_before
  from private.ai_quota_windows
  where quota_key = any(p_keys);

  update private.ai_quota_windows
  set request_count = 0,
      window_started_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where quota_key = any(p_keys);

  insert into public.admin_audit_log (
    actor_id, target_user_id, action, before, after, reason, outcome
  ) values (
    p_actor_id,
    p_target_user_id,
    'ai_quota_reset',
    jsonb_build_object('request_count', v_before),
    jsonb_build_object('request_count', 0),
    p_reason,
    'succeeded'
  );
end;
$$;

create or replace function public.admin_set_manual_pro(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_grant boolean,
  p_until timestamptz,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_before jsonb;
  v_status text;
  v_manual_until timestamptz;
  v_pro boolean;
begin
  if p_reason is null or char_length(p_reason) < 3 or char_length(p_reason) > 500 then
    raise exception 'invalid reason';
  end if;
  if p_grant and (p_until is null or p_until <= clock_timestamp()) then
    raise exception 'manual pro must end in the future';
  end if;

  select jsonb_build_object(
    'status', status,
    'manual_pro_until', manual_pro_until
  )
  into v_before
  from public.subscriptions
  where user_id = p_target_user_id;

  if p_grant then
    insert into public.subscriptions (
      user_id, status, manual_pro_until, manual_pro_reason, manual_pro_granted_by, updated_at
    ) values (
      p_target_user_id, 'inactive', p_until, p_reason, p_actor_id, clock_timestamp()
    )
    on conflict (user_id) do update
    set manual_pro_until = excluded.manual_pro_until,
        manual_pro_reason = excluded.manual_pro_reason,
        manual_pro_granted_by = excluded.manual_pro_granted_by,
        updated_at = excluded.updated_at;
  else
    update public.subscriptions
    set manual_pro_until = null,
        manual_pro_reason = p_reason,
        manual_pro_granted_by = p_actor_id,
        updated_at = clock_timestamp()
    where user_id = p_target_user_id;
  end if;

  select status, manual_pro_until
  into v_status, v_manual_until
  from public.subscriptions
  where user_id = p_target_user_id;

  v_pro := coalesce(v_status in ('active', 'trialing'), false)
    or (v_manual_until is not null and v_manual_until > clock_timestamp());

  update public.viewings
  set is_pro = v_pro
  where user_id = p_target_user_id
    and is_pro is distinct from v_pro;

  insert into public.admin_audit_log (
    actor_id, target_user_id, action, before, after, reason, outcome
  ) values (
    p_actor_id,
    p_target_user_id,
    case when p_grant then 'pro_grant' else 'pro_revoke' end,
    coalesce(v_before, '{}'::jsonb),
    jsonb_build_object(
      'status', v_status,
      'manual_pro_until', case when p_grant then p_until else null end
    ),
    p_reason,
    'succeeded'
  );
end;
$$;

revoke all on function public.admin_list_users(text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.admin_get_ai_usage(text[])
  from public, anon, authenticated;
revoke all on function public.admin_reset_ai_quota(uuid, uuid, text[], text)
  from public, anon, authenticated;
revoke all on function public.admin_set_manual_pro(uuid, uuid, boolean, timestamptz, text)
  from public, anon, authenticated;

grant execute on function public.admin_list_users(text, integer, integer) to service_role;
grant execute on function public.admin_get_ai_usage(text[]) to service_role;
grant execute on function public.admin_reset_ai_quota(uuid, uuid, text[], text) to service_role;
grant execute on function public.admin_set_manual_pro(uuid, uuid, boolean, timestamptz, text)
  to service_role;

-- Same ordering rules as migrate-stripe-ordering-forward-fix.sql.
-- viewings.is_pro follows Stripe status or an unexpired manual_pro_until.
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
  v_rank integer;
  v_pro boolean;
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

  v_active := p_status in ('active', 'trialing');
  v_rank := case
    when p_event_type = 'customer.subscription.deleted' or p_status = 'canceled' then 3
    when not v_active then 2
    else 1
  end;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into v_current
  from public.subscriptions
  where user_id = p_user_id
  for update;

  if found and (
    v_current.last_stripe_event_created > p_event_created
    or (
      v_current.last_stripe_event_created = p_event_created
      and (
        v_current.last_stripe_event_rank > v_rank
        or (
          v_current.last_stripe_event_rank = v_rank
          and coalesce(v_current.last_stripe_event_id, '') >= p_event_id
        )
      )
    )
  ) then
    return query select 'out_of_order'::text;
    return;
  end if;

  insert into public.subscriptions (
    user_id, stripe_customer_id, status, plan, updated_at,
    last_stripe_event_created, last_stripe_event_rank, last_stripe_event_id
  ) values (
    p_user_id, p_customer_id, p_status,
    case when v_active then p_plan else null end,
    clock_timestamp(), p_event_created, v_rank, p_event_id
  )
  on conflict (user_id) do update
  set stripe_customer_id = coalesce(excluded.stripe_customer_id, public.subscriptions.stripe_customer_id),
      status = excluded.status,
      plan = excluded.plan,
      updated_at = excluded.updated_at,
      last_stripe_event_created = excluded.last_stripe_event_created,
      last_stripe_event_rank = excluded.last_stripe_event_rank,
      last_stripe_event_id = excluded.last_stripe_event_id;

  v_pro := v_active or coalesce(
    (
      select s.manual_pro_until is not null
        and s.manual_pro_until > clock_timestamp()
      from public.subscriptions s
      where s.user_id = p_user_id
    ),
    false
  );

  update public.viewings
  set is_pro = v_pro
  where user_id = p_user_id
    and is_pro is distinct from v_pro;

  update private.stripe_webhook_events
  set outcome = 'applied'
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
