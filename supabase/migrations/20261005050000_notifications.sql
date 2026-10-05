-- In-app notification inbox + per-user email preference defaults.
-- Inserts only via service_role APIs; authenticated users may select/update own rows.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  href text,
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  dedupe_key text,
  read_at timestamptz,
  email_status text not null default 'skipped'
    check (email_status in ('skipped', 'queued', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  constraint notifications_type_len check (char_length(type) between 1 and 64),
  constraint notifications_title_len check (char_length(title) between 1 and 200),
  constraint notifications_body_len check (char_length(body) <= 2000),
  constraint notifications_href_len check (href is null or char_length(href) <= 500),
  constraint notifications_dedupe_key_len check (
    dedupe_key is null or char_length(dedupe_key) between 1 and 200
  )
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

create unique index if not exists notifications_user_type_dedupe_uidx
  on public.notifications (user_id, type, dedupe_key)
  where dedupe_key is not null;

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;

revoke all on table public.notifications from public, anon, authenticated;
revoke all on table public.notification_preferences from public, anon, authenticated;

grant select, update (read_at) on table public.notifications to authenticated;
grant select, insert, update on table public.notification_preferences to authenticated;
grant all on table public.notifications to service_role;
grant all on table public.notification_preferences to service_role;

drop policy if exists "users select own notifications" on public.notifications;
create policy "users select own notifications"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "users update own notifications read_at" on public.notifications;
create policy "users update own notifications read_at"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "users select own notification preferences" on public.notification_preferences;
create policy "users select own notification preferences"
  on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "users upsert own notification preferences" on public.notification_preferences;
create policy "users upsert own notification preferences"
  on public.notification_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "users update own notification preferences" on public.notification_preferences;
create policy "users update own notification preferences"
  on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Resolve auth user id by email for invitee in-app delivery (service_role only).
create or replace function public.lookup_auth_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, auth
as $$
  select id
  from auth.users
  where lower(email::text) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.lookup_auth_user_id_by_email(text) from public;
revoke all on function public.lookup_auth_user_id_by_email(text) from anon, authenticated;
grant execute on function public.lookup_auth_user_id_by_email(text) to service_role;
