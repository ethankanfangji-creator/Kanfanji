create or replace function public.viewing_has_active_session(p_viewing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.viewing_sessions
    where viewing_id = p_viewing_id
      and status = 'active'
  );
$$;

revoke all on function public.viewing_has_active_session(uuid) from public, anon, authenticated;
grant execute on function public.viewing_has_active_session(uuid) to authenticated;

drop policy if exists "active sessions select cards" on public.viewing_cards;
create policy "active sessions select cards"
  on public.viewing_cards
  for select
  to authenticated
  using ((select public.viewing_has_active_session(viewing_id)));
