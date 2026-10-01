create table if not exists public.viewing_card_templates (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  icon text,
  sort_order int not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists viewing_card_templates_owner_user_id_idx
  on public.viewing_card_templates (owner_user_id);

create table if not exists public.viewing_cards (
  id uuid primary key default gen_random_uuid(),
  viewing_id uuid not null references public.viewings (id) on delete cascade,
  template_id uuid references public.viewing_card_templates (id),
  status text not null default 'unsure' check (status in ('good', 'bad', 'unsure')),
  notes text,
  photos text[] not null default '{}',
  voice_path text,
  voice_transcript text,
  collected_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (viewing_id, template_id)
);

create index if not exists viewing_cards_template_id_idx
  on public.viewing_cards (template_id);
create index if not exists viewing_cards_collected_by_idx
  on public.viewing_cards (collected_by);

create table if not exists public.viewing_sessions (
  id uuid primary key default gen_random_uuid(),
  viewing_id uuid not null references public.viewings (id) on delete cascade,
  code text not null unique,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists viewing_sessions_viewing_id_idx
  on public.viewing_sessions (viewing_id);
create index if not exists viewing_sessions_created_by_idx
  on public.viewing_sessions (created_by);

create table if not exists public.discussion_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  viewing_ids uuid[] not null,
  share_code text not null unique,
  title text,
  created_at timestamptz not null default now()
);

create index if not exists discussion_rooms_owner_user_id_idx
  on public.discussion_rooms (owner_user_id);

create table if not exists public.discussion_comments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.discussion_rooms (id) on delete cascade,
  card_id uuid references public.viewing_cards (id) on delete set null,
  nickname text not null,
  content text,
  vote text check (vote in ('like', 'meh', 'dislike')),
  created_at timestamptz not null default now()
);

create index if not exists discussion_comments_room_id_idx
  on public.discussion_comments (room_id);
create index if not exists discussion_comments_card_id_idx
  on public.discussion_comments (card_id);

alter table public.viewing_card_templates enable row level security;
alter table public.viewing_cards enable row level security;
alter table public.viewing_sessions enable row level security;
alter table public.discussion_rooms enable row level security;
alter table public.discussion_comments enable row level security;

revoke all on table public.viewing_card_templates from public, anon, authenticated;
revoke all on table public.viewing_cards from public, anon, authenticated;
revoke all on table public.viewing_sessions from public, anon, authenticated;
revoke all on table public.discussion_rooms from public, anon, authenticated;
revoke all on table public.discussion_comments from public, anon, authenticated;

grant select, insert, update, delete on table public.viewing_card_templates to authenticated;
grant select, insert, update, delete on table public.viewing_cards to authenticated;
grant select, insert, update, delete on table public.viewing_sessions to authenticated;
grant select, insert, update, delete on table public.discussion_rooms to authenticated;
grant select, insert, update, delete on table public.discussion_comments to authenticated;

grant all on table public.viewing_card_templates to service_role;
grant all on table public.viewing_cards to service_role;
grant all on table public.viewing_sessions to service_role;
grant all on table public.discussion_rooms to service_role;
grant all on table public.discussion_comments to service_role;

drop policy if exists "owners select own or system templates" on public.viewing_card_templates;
create policy "owners select own or system templates"
  on public.viewing_card_templates
  for select
  to authenticated
  using (
    owner_user_id = (select auth.uid())
    or is_system = true
  );

drop policy if exists "owners insert own templates" on public.viewing_card_templates;
create policy "owners insert own templates"
  on public.viewing_card_templates
  for insert
  to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and is_system = false
  );

drop policy if exists "owners update own templates" on public.viewing_card_templates;
create policy "owners update own templates"
  on public.viewing_card_templates
  for update
  to authenticated
  using (
    owner_user_id = (select auth.uid())
    and is_system = false
  )
  with check (
    owner_user_id = (select auth.uid())
    and is_system = false
  );

drop policy if exists "owners delete own templates" on public.viewing_card_templates;
create policy "owners delete own templates"
  on public.viewing_card_templates
  for delete
  to authenticated
  using (
    owner_user_id = (select auth.uid())
    and is_system = false
  );

drop policy if exists "viewing owners select cards" on public.viewing_cards;
create policy "viewing owners select cards"
  on public.viewing_cards
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.viewings v
      where v.id = viewing_id
        and v.user_id = (select auth.uid())
    )
  );

drop policy if exists "viewing owners insert cards" on public.viewing_cards;
create policy "viewing owners insert cards"
  on public.viewing_cards
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.viewings v
      where v.id = viewing_id
        and v.user_id = (select auth.uid())
    )
  );

drop policy if exists "viewing owners update cards" on public.viewing_cards;
create policy "viewing owners update cards"
  on public.viewing_cards
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.viewings v
      where v.id = viewing_id
        and v.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.viewings v
      where v.id = viewing_id
        and v.user_id = (select auth.uid())
    )
  );

drop policy if exists "viewing owners delete cards" on public.viewing_cards;
create policy "viewing owners delete cards"
  on public.viewing_cards
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.viewings v
      where v.id = viewing_id
        and v.user_id = (select auth.uid())
    )
  );

drop policy if exists "creators select sessions" on public.viewing_sessions;
create policy "creators select sessions"
  on public.viewing_sessions
  for select
  to authenticated
  using (created_by = (select auth.uid()));

drop policy if exists "creators insert sessions" on public.viewing_sessions;
create policy "creators insert sessions"
  on public.viewing_sessions
  for insert
  to authenticated
  with check (created_by = (select auth.uid()));

drop policy if exists "creators update sessions" on public.viewing_sessions;
create policy "creators update sessions"
  on public.viewing_sessions
  for update
  to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

drop policy if exists "creators delete sessions" on public.viewing_sessions;
create policy "creators delete sessions"
  on public.viewing_sessions
  for delete
  to authenticated
  using (created_by = (select auth.uid()));

drop policy if exists "owners select discussion rooms" on public.discussion_rooms;
create policy "owners select discussion rooms"
  on public.discussion_rooms
  for select
  to authenticated
  using (owner_user_id = (select auth.uid()));

drop policy if exists "owners insert discussion rooms" on public.discussion_rooms;
create policy "owners insert discussion rooms"
  on public.discussion_rooms
  for insert
  to authenticated
  with check (owner_user_id = (select auth.uid()));

drop policy if exists "owners update discussion rooms" on public.discussion_rooms;
create policy "owners update discussion rooms"
  on public.discussion_rooms
  for update
  to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

drop policy if exists "owners delete discussion rooms" on public.discussion_rooms;
create policy "owners delete discussion rooms"
  on public.discussion_rooms
  for delete
  to authenticated
  using (owner_user_id = (select auth.uid()));

drop policy if exists "room owners select comments" on public.discussion_comments;
create policy "room owners select comments"
  on public.discussion_comments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.discussion_rooms r
      where r.id = room_id
        and r.owner_user_id = (select auth.uid())
    )
  );

drop policy if exists "room owners insert comments" on public.discussion_comments;
create policy "room owners insert comments"
  on public.discussion_comments
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.discussion_rooms r
      where r.id = room_id
        and r.owner_user_id = (select auth.uid())
    )
  );

drop policy if exists "room owners update comments" on public.discussion_comments;
create policy "room owners update comments"
  on public.discussion_comments
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.discussion_rooms r
      where r.id = room_id
        and r.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.discussion_rooms r
      where r.id = room_id
        and r.owner_user_id = (select auth.uid())
    )
  );

drop policy if exists "room owners delete comments" on public.discussion_comments;
create policy "room owners delete comments"
  on public.discussion_comments
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.discussion_rooms r
      where r.id = room_id
        and r.owner_user_id = (select auth.uid())
    )
  );
