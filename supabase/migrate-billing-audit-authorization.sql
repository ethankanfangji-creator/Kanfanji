-- Additive billing ledger and atomic authorization/audit functions.
-- Apply after migrate-viewing-collaboration.sql.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.subscriptions
  add column if not exists last_stripe_event_created bigint,
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
  select * into v_current
  from public.subscriptions
  where user_id = p_user_id
  for update;

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

-- One transaction performs each collaboration mutation and its audit insert.
-- The function is server-only; p_actor_id is checked against ownership/active role.
create or replace function public.mutate_viewing_with_audit(
  p_operation text,
  p_viewing_id uuid,
  p_actor_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text;
  v_row jsonb;
  v_now timestamptz := clock_timestamp();
  v_expected integer;
  v_next integer;
  v_member_role text;
  v_email text;
begin
  if p_actor_id is null
     or not exists (select 1 from auth.users where id = p_actor_id) then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  select case
    when v.user_id = p_actor_id then 'owner'
    else (
      select vm.role from public.viewing_members vm
      where vm.viewing_id = v.id and vm.user_id = p_actor_id
        and vm.status = 'active' limit 1
    )
  end into v_role
  from public.viewings v
  where v.id = p_viewing_id
  for update;

  if v_role is null and p_operation <> 'invite.accept' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_operation = 'invite.create' then
    if v_role <> 'owner' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
    v_email := lower(trim(p_payload ->> 'email'));
    v_member_role := p_payload ->> 'role';
    if v_email is null or position('@' in v_email) < 2
       or v_member_role not in ('viewer', 'commenter', 'editor') then
      raise exception 'INVALID_INVITE';
    end if;
    update public.viewing_invites
    set status = 'revoked', revoked_at = v_now
    where viewing_id = p_viewing_id and email = v_email and status = 'pending';
    insert into public.viewing_invites (
      viewing_id, email, role, token_hash, status, invited_by, expires_at
    ) values (
      p_viewing_id, v_email, v_member_role, p_payload ->> 'tokenHash',
      'pending', p_actor_id, (p_payload ->> 'expiresAt')::timestamptz
    ) returning to_jsonb(viewing_invites.*) into v_row;
  elsif p_operation = 'invite.accept' then
    update public.viewing_invites
    set status = 'accepted', accepted_at = v_now
    where id = (p_payload ->> 'inviteId')::uuid
      and viewing_id = p_viewing_id and status = 'pending'
      and expires_at > v_now and lower(email::text) = lower(p_payload ->> 'email')
    returning jsonb_build_object('role', role) into v_row;
    if v_row is null then raise exception 'INVITE_UNAVAILABLE'; end if;
    insert into public.viewing_members (
      viewing_id, user_id, role, status, updated_at, revoked_at
    ) values (
      p_viewing_id, p_actor_id, v_row ->> 'role', 'active', v_now, null
    ) on conflict (viewing_id, user_id) do update
      set role = excluded.role, status = 'active',
          updated_at = excluded.updated_at, revoked_at = null;
  elsif p_operation = 'member.role_change' then
    if v_role <> 'owner' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
    v_member_role := p_payload ->> 'role';
    if v_member_role not in ('viewer', 'commenter', 'editor') then raise exception 'INVALID_ROLE'; end if;
    update public.viewing_members
    set role = v_member_role, updated_at = v_now
    where id = (p_payload ->> 'memberId')::uuid
      and viewing_id = p_viewing_id and status = 'active'
    returning to_jsonb(viewing_members.*) into v_row;
    if v_row is null then raise exception 'MEMBER_NOT_FOUND'; end if;
  elsif p_operation = 'member.revoke' then
    if v_role <> 'owner' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
    update public.viewing_members
    set status = 'revoked', revoked_at = v_now, updated_at = v_now
    where id = (p_payload ->> 'memberId')::uuid
      and viewing_id = p_viewing_id and status = 'active'
    returning jsonb_build_object('id', id) into v_row;
    if v_row is null then raise exception 'MEMBER_NOT_FOUND'; end if;
  elsif p_operation = 'invite.revoke' then
    if v_role <> 'owner' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
    update public.viewing_invites
    set status = 'revoked', revoked_at = v_now
    where id = (p_payload ->> 'inviteId')::uuid
      and viewing_id = p_viewing_id and status = 'pending'
    returning jsonb_build_object('id', id) into v_row;
    if v_row is null then raise exception 'INVITE_NOT_FOUND'; end if;
  elsif p_operation = 'comment.create' then
    if v_role not in ('owner', 'editor', 'commenter') then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    insert into public.viewing_comments (viewing_id, author_id, body, anchor)
    values (
      p_viewing_id, p_actor_id, p_payload ->> 'body', p_payload -> 'anchor'
    ) returning to_jsonb(viewing_comments.*) into v_row;
  elsif p_operation = 'viewing.update' then
    if v_role not in ('owner', 'editor') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
    v_expected := (p_payload ->> 'expectedRevision')::integer;
    v_next := v_expected + 1;
    update public.viewings
    set address = case when p_payload ? 'address' then p_payload ->> 'address' else address end,
        tags = case when p_payload ? 'tags' then array(select jsonb_array_elements_text(p_payload -> 'tags')) else tags end,
        market = case when p_payload ? 'market' then p_payload ->> 'market' else market end,
        questions = case when p_payload ? 'questions' then p_payload -> 'questions' else questions end,
        notes = case when p_payload ? 'notes' then p_payload -> 'notes' else notes end,
        pros = case when p_payload ? 'pros' then array(select jsonb_array_elements_text(p_payload -> 'pros')) else pros end,
        risks = case when p_payload ? 'risks' then array(select jsonb_array_elements_text(p_payload -> 'risks')) else risks end,
        property = case when p_payload ? 'property' then
          case when v_role = 'owner' then p_payload -> 'property'
          else ((p_payload -> 'property') - 'shareAccess')
            || case when property ? 'shareAccess'
              then jsonb_build_object('shareAccess', property -> 'shareAccess') else '{}'::jsonb end
          end else property end,
        revision = v_next, updated_at = v_now
    where id = p_viewing_id and revision = v_expected
    returning jsonb_build_object('revision', revision, 'updated_at', updated_at) into v_row;
    if v_row is null then raise exception 'REVISION_CONFLICT' using errcode = '40001'; end if;
  elsif p_operation = 'media.append' then
    if v_role not in ('owner', 'editor') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
    if p_payload ->> 'column' not in ('photo_urls', 'video_urls', 'audio_urls') then
      raise exception 'INVALID_MEDIA_PATH';
    end if;
    if p_payload ->> 'column' = 'photo_urls' then
      update public.viewings
      set photo_urls = array_append(photo_urls, p_payload ->> 'path'),
          revision = revision + 1, updated_at = v_now
      where id = p_viewing_id and not (p_payload ->> 'path' = any(photo_urls))
      returning jsonb_build_object('revision', revision, 'alreadyExisted', false) into v_row;
    elsif p_payload ->> 'column' = 'video_urls' then
      update public.viewings
      set video_urls = array_append(video_urls, p_payload ->> 'path'),
          revision = revision + 1, updated_at = v_now
      where id = p_viewing_id and not (p_payload ->> 'path' = any(video_urls))
      returning jsonb_build_object('revision', revision, 'alreadyExisted', false) into v_row;
    else
      update public.viewings
      set audio_urls = array_append(audio_urls, p_payload ->> 'path'),
          revision = revision + 1, updated_at = v_now
      where id = p_viewing_id and not (p_payload ->> 'path' = any(audio_urls))
      returning jsonb_build_object('revision', revision, 'alreadyExisted', false) into v_row;
    end if;
    if v_row is null then
      select jsonb_build_object('revision', revision, 'alreadyExisted', true)
      into v_row from public.viewings where id = p_viewing_id;
      return v_row;
    end if;
  else
    raise exception 'INVALID_OPERATION';
  end if;

  insert into public.viewing_audit_events (viewing_id, actor_id, action, meta)
  values (
    p_viewing_id, p_actor_id, p_operation,
    (p_payload - 'tokenHash') #- '{property,shareAccess}'
  );
  return coalesce(v_row, '{}'::jsonb);
end;
$$;

revoke all on function public.mutate_viewing_with_audit(text, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.mutate_viewing_with_audit(text, uuid, uuid, jsonb)
  to service_role;

-- FK/RLS lookup indexes not already guaranteed by the collaboration migration.
create index if not exists viewing_invites_invited_by_idx
  on public.viewing_invites (invited_by);
create index if not exists viewing_comments_author_id_idx
  on public.viewing_comments (author_id);
create index if not exists viewing_audit_actor_id_idx
  on public.viewing_audit_events (actor_id);
