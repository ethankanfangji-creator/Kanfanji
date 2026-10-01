drop policy if exists "members select shared viewings" on public.viewings;
create policy "members select shared viewings"
  on public.viewings
  for select
  to authenticated
  using ((select private.viewing_role(id)) is not null);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'viewings'
     ) then
    alter publication supabase_realtime add table public.viewings;
  end if;
end $$;
