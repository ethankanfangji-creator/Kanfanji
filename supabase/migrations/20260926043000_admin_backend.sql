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

  select status into v_status
  from public.subscriptions
  where user_id = p_target_user_id;

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
