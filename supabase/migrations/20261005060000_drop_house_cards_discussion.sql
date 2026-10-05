-- Drop the retired house-cards / live-session / family-discussion product surface.
-- App code for /live, /d, ChatCards, and related APIs was removed; these objects
-- are no longer referenced. Use IF EXISTS so environments that never applied the
-- create migrations (e.g. some prod snapshots) stay idempotent.

-- Realtime publication (ignore if table or publication membership is absent).
do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'viewing_cards'
  ) then
    alter publication supabase_realtime drop table public.viewing_cards;
  end if;
exception
  when undefined_table then
    null;
  when undefined_object then
    null;
end $$;

drop function if exists public.read_live_viewing(text);
drop function if exists public.viewing_has_active_session(uuid);
drop function if exists private.ensure_live_viewer(uuid);

drop trigger if exists viewing_card_templates_protect_system_name on public.viewing_card_templates;
drop function if exists public.protect_system_card_template_name();

drop table if exists public.discussion_comments;
drop table if exists public.discussion_rooms;
drop table if exists public.viewing_sessions;
drop table if exists public.viewing_cards;
drop table if exists public.viewing_card_templates;
