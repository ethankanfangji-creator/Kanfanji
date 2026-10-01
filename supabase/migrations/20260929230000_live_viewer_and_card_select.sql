create or replace function private.ensure_live_viewer(p_viewing_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or p_viewing_id is null then
    return;
  end if;
  if exists (
    select 1 from public.viewings
    where id = p_viewing_id and user_id = auth.uid()
  ) then
    return;
  end if;

  insert into public.viewing_members (viewing_id, user_id, role, status)
  values (p_viewing_id, auth.uid(), 'viewer', 'active')
  on conflict (viewing_id, user_id) do update
    set status = 'active',
        revoked_at = null,
        updated_at = now()
    where viewing_members.role = 'viewer';
end;
$$;

revoke all on function private.ensure_live_viewer(uuid) from public, anon, authenticated;

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

drop policy if exists "active sessions select cards" on public.viewing_cards;
drop policy if exists "live members select cards" on public.viewing_cards;
create policy "live members select cards"
  on public.viewing_cards
  for select
  to authenticated
  using ((select private.viewing_role(viewing_id)) is not null);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'viewing_cards'
     ) then
    alter publication supabase_realtime add table public.viewing_cards;
  end if;
end $$;
