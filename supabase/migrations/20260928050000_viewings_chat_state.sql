-- Chat threads store collection state separately from wizard rows.
-- chat_state null means a wizard viewing. Authenticated clients have no
-- column grant on chat_state; writes go through the service role.

alter table public.viewings
  add column if not exists chat_state jsonb;

alter table public.viewings
  drop constraint if exists viewings_chat_state_size;
alter table public.viewings
  add constraint viewings_chat_state_size
  check (chat_state is null or pg_column_size(chat_state) <= 524288);

alter table public.viewings
  drop constraint if exists viewings_messages_size;
alter table public.viewings
  add constraint viewings_messages_size
  check (pg_column_size(messages) <= 2097152);

revoke all (chat_state) on public.viewings from public, anon, authenticated;

create or replace function public.lock_viewing_create(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('viewing_create:' || p_user_id::text, 0));
end;
$$;

revoke all on function public.lock_viewing_create(uuid) from public, anon, authenticated;
grant execute on function public.lock_viewing_create(uuid) to service_role;
