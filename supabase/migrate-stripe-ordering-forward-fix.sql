-- Additive forward fix after migrate-billing-audit-authorization.sql.
-- Same-second ordering is deterministic by (created, safety rank, event id).
-- Non-entitled states outrank active/trialing, so cancellation/denial can never
-- be overwritten by a same-second entitlement event.

alter table public.subscriptions
  add column if not exists last_stripe_event_rank integer not null default 0;

update public.subscriptions
set last_stripe_event_rank = case
  when status = 'canceled' then 3
  when status in ('active', 'trialing') then 1
  else 2
end
where last_stripe_event_rank = 0;

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

  update public.viewings
  set is_pro = v_active
  where user_id = p_user_id
    and is_pro is distinct from v_active;

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
