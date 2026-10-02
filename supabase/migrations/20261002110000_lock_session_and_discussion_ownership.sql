-- Live sessions and discussion rooms were insertable/updatable by any
-- authenticated user as long as they set created_by / owner_user_id to
-- themselves. That let a client retarget another person's viewing_id and
-- read private cards through read_live_viewing or /d/{code}.

drop policy if exists "creators select sessions" on public.viewing_sessions;
drop policy if exists "creators insert sessions" on public.viewing_sessions;
drop policy if exists "creators update sessions" on public.viewing_sessions;
drop policy if exists "creators delete sessions" on public.viewing_sessions;
drop policy if exists "viewing owners select sessions" on public.viewing_sessions;
drop policy if exists "viewing owners insert sessions" on public.viewing_sessions;
drop policy if exists "viewing owners update sessions" on public.viewing_sessions;
drop policy if exists "viewing owners delete sessions" on public.viewing_sessions;

create policy "viewing owners select sessions"
  on public.viewing_sessions
  for select
  to authenticated
  using ((select private.viewing_role(viewing_id)) = 'owner');

create policy "viewing owners insert sessions"
  on public.viewing_sessions
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.viewing_role(viewing_id)) = 'owner'
  );

create policy "viewing owners update sessions"
  on public.viewing_sessions
  for update
  to authenticated
  using ((select private.viewing_role(viewing_id)) = 'owner')
  with check (
    created_by = (select auth.uid())
    and (select private.viewing_role(viewing_id)) = 'owner'
  );

create policy "viewing owners delete sessions"
  on public.viewing_sessions
  for delete
  to authenticated
  using ((select private.viewing_role(viewing_id)) = 'owner');

drop policy if exists "owners insert discussion rooms" on public.discussion_rooms;
create policy "owners insert discussion rooms"
  on public.discussion_rooms
  for insert
  to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and cardinality(viewing_ids) > 0
    and not exists (
      select 1
      from unnest(viewing_ids) as vid
      where (select private.viewing_role(vid)) is distinct from 'owner'
    )
  );

drop policy if exists "owners update discussion rooms" on public.discussion_rooms;
create policy "owners update discussion rooms"
  on public.discussion_rooms
  for update
  to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (
    owner_user_id = (select auth.uid())
    and cardinality(viewing_ids) > 0
    and not exists (
      select 1
      from unnest(viewing_ids) as vid
      where (select private.viewing_role(vid)) is distinct from 'owner'
    )
  );

create or replace function public.read_live_viewing(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_session public.viewing_sessions%rowtype;
  v_owner uuid;
  v_address text;
  v_cards jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_code is null or char_length(p_code) <> 6 then
    return null;
  end if;

  select * into v_session
  from public.viewing_sessions
  where code = p_code
    and status = 'active';
  if v_session.id is null then
    return null;
  end if;

  select v.user_id, v.address into v_owner, v_address
  from public.viewings v
  where v.id = v_session.viewing_id;
  if v_owner is null then
    return null;
  end if;

  -- A session created by anyone other than the viewing owner is a backdoor.
  if v_session.created_by is distinct from v_owner then
    return null;
  end if;

  if auth.uid() is distinct from v_owner then
    perform private.ensure_live_viewer(v_session.viewing_id);
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'templateId', t.id,
        'name', t.name,
        'icon', t.icon,
        'sortOrder', t.sort_order,
        'isSystem', t.is_system,
        'status', c.status,
        'notes', c.notes,
        'voiceTranscript', c.voice_transcript,
        'photos', coalesce(c.photos, '{}'::text[])
      )
      order by t.is_system desc, t.sort_order asc, t.created_at asc
    ),
    '[]'::jsonb
  )
  into v_cards
  from public.viewing_card_templates t
  left join public.viewing_cards c
    on c.template_id = t.id
   and c.viewing_id = v_session.viewing_id
  where t.is_system = true
     or t.owner_user_id = v_owner;

  return jsonb_build_object(
    'sessionId', v_session.id,
    'code', v_session.code,
    'viewingId', v_session.viewing_id,
    'ownerUserId', v_owner,
    'address', v_address,
    'cards', v_cards
  );
end;
$$;

revoke all on function public.read_live_viewing(text) from public, anon, authenticated;
grant execute on function public.read_live_viewing(text) to authenticated;
