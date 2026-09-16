-- Per-viewing family collaboration.
-- Keeps viewings.user_id as the canonical owner so the existing single-viewing
-- workflow remains unchanged.

create extension if not exists "citext";
create extension if not exists "pgcrypto";

alter table public.viewings
  add column if not exists revision integer not null default 1;

create table if not exists public.viewing_members (
  id uuid primary key default gen_random_uuid(),
  viewing_id uuid not null references public.viewings (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('viewer', 'commenter', 'editor')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (viewing_id, user_id)
);

create index if not exists viewing_members_user_active_idx
  on public.viewing_members (user_id, viewing_id)
  where status = 'active';

create index if not exists viewing_members_viewing_active_idx
  on public.viewing_members (viewing_id, user_id)
  where status = 'active';

create table if not exists public.viewing_invites (
  id uuid primary key default gen_random_uuid(),
  viewing_id uuid not null references public.viewings (id) on delete cascade,
  email citext not null,
  role text not null check (role in ('viewer', 'commenter', 'editor')),
  token_hash text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);

create unique index if not exists viewing_invites_one_pending_email_idx
  on public.viewing_invites (viewing_id, email)
  where status = 'pending';

create table if not exists public.viewing_comments (
  id uuid primary key default gen_random_uuid(),
  viewing_id uuid not null references public.viewings (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 4000),
  anchor jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists viewing_comments_viewing_created_idx
  on public.viewing_comments (viewing_id, created_at);

create table if not exists public.viewing_audit_events (
  id bigint generated always as identity primary key,
  viewing_id uuid not null references public.viewings (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists viewing_audit_viewing_created_idx
  on public.viewing_audit_events (viewing_id, created_at desc);

alter table public.viewing_members enable row level security;
alter table public.viewing_invites enable row level security;
alter table public.viewing_comments enable row level security;
alter table public.viewing_audit_events enable row level security;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Central role lookup avoids recursive RLS policies on viewing_members.
create or replace function private.viewing_role(p_viewing_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when v.user_id = (select auth.uid()) then 'owner'
    else (
      select vm.role
      from public.viewing_members vm
      where vm.viewing_id = v.id
        and vm.user_id = (select auth.uid())
        and vm.status = 'active'
      limit 1
    )
  end
  from public.viewings v
  where v.id = p_viewing_id
  limit 1;
$$;

revoke all on function private.viewing_role(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.viewing_role(uuid) to authenticated;

create or replace function private.storage_viewing_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when (storage.foldername(p_name))[2] ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then ((storage.foldername(p_name))[2])::uuid
    else null
  end;
$$;

revoke all on function private.storage_viewing_id(text) from public, anon;
grant execute on function private.storage_viewing_id(text) to authenticated;

-- Viewings: owner keeps full access. Active members can read; editors can update.
drop policy if exists "users can select own viewings" on public.viewings;
drop policy if exists "owners and members can select viewings" on public.viewings;
create policy "owners and members can select viewings"
  on public.viewings for select to authenticated
  using (private.viewing_role(id) is not null);

drop policy if exists "users can update own viewings" on public.viewings;
drop policy if exists "owners and editors can update viewings" on public.viewings;
create policy "owners and editors can update viewings"
  on public.viewings for update to authenticated
  using (private.viewing_role(id) in ('owner', 'editor'))
  with check (private.viewing_role(id) in ('owner', 'editor'));

-- Prevent authenticated editors from bypassing owner-only fields or revision.
create or replace function private.guard_viewing_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and old.user_id is distinct from new.user_id then
    raise exception 'ownership transfer is not available'
      using errcode = '42501';
  end if;
  if auth.uid() is not null and auth.uid() is distinct from old.user_id then
    if old.share_token is distinct from new.share_token
       or old.is_pro is distinct from new.is_pro
       or old.property_id is distinct from new.property_id
       or old.created_at is distinct from new.created_at
       or (old.property -> 'shareAccess')
          is distinct from (new.property -> 'shareAccess') then
      raise exception 'editor cannot modify owner-controlled fields'
        using errcode = '42501';
    end if;
    if new.revision is distinct from old.revision + 1 then
      raise exception 'editor update requires the next revision'
        using errcode = '40001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_viewing_owner_change_trigger on public.viewings;
drop trigger if exists guard_viewing_update_trigger on public.viewings;
create trigger guard_viewing_update_trigger
  before update on public.viewings
  for each row execute function private.guard_viewing_update();

revoke all on function private.guard_viewing_update() from public, anon, authenticated;
drop function if exists public.guard_viewing_owner_change();

-- Membership rows are readable by collaborators; only owner APIs mutate them.
drop policy if exists "collaborators can read members" on public.viewing_members;
create policy "collaborators can read members"
  on public.viewing_members for select to authenticated
  using (private.viewing_role(viewing_id) is not null);

-- Owner can see invite metadata. Insert/update goes through owner-checked APIs.
drop policy if exists "owners can read invites" on public.viewing_invites;
create policy "owners can read invites"
  on public.viewing_invites for select to authenticated
  using (private.viewing_role(viewing_id) = 'owner');

-- Comments: all active collaborators can read; commenter/editor/owner can add.
drop policy if exists "collaborators can read comments" on public.viewing_comments;
create policy "collaborators can read comments"
  on public.viewing_comments for select to authenticated
  using (private.viewing_role(viewing_id) is not null);

drop policy if exists "commenters can add comments" on public.viewing_comments;
create policy "commenters can add comments"
  on public.viewing_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and private.viewing_role(viewing_id) in ('owner', 'commenter', 'editor')
  );

-- Owner may read the append-only audit log. Only service-role APIs insert.
drop policy if exists "owners can read audit events" on public.viewing_audit_events;
create policy "owners can read audit events"
  on public.viewing_audit_events for select to authenticated
  using (private.viewing_role(viewing_id) = 'owner');

grant select on public.viewing_members to authenticated;
grant select on public.viewing_invites to authenticated;
grant select, insert on public.viewing_comments to authenticated;
grant select on public.viewing_audit_events to authenticated;
grant all on public.viewing_members, public.viewing_invites,
  public.viewing_comments, public.viewing_audit_events to service_role;

-- Sensitive fields are available only through role-aware server projections.
-- Direct PostgREST reads remain sufficient for lists, sync metadata and RLS.
revoke select on public.viewings from authenticated;
grant select (
  id, user_id, property_id, address, tags, market, questions, pros, risks,
  photo_urls, video_urls, client_updated_at, is_pro, created_at, updated_at,
  revision
) on public.viewings to authenticated;

-- Storage paths remain owner_id/viewing_id/folder/file. Members can read files
-- only when the path's viewing_id matches an active membership. Editors may
-- write into the owner's prefix for that viewing.
drop policy if exists "public can read viewing media" on storage.objects;
drop policy if exists "users can read own viewing media" on storage.objects;
drop policy if exists "owners and members can read viewing media" on storage.objects;
create policy "owners and members can read viewing media"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'viewing-media'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (
        private.viewing_role(private.storage_viewing_id(name)) is not null
        and (
          private.viewing_role(private.storage_viewing_id(name)) <> 'viewer'
          or (storage.foldername(name))[3] <> 'audios'
        )
      )
    )
  );

drop policy if exists "users can upload own viewing media" on storage.objects;
drop policy if exists "owners and editors can upload viewing media" on storage.objects;
create policy "owners and editors can upload viewing media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'viewing-media'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (
        private.viewing_role(private.storage_viewing_id(name)) = 'editor'
        and exists (
          select 1 from public.viewings v
          where v.id::text = (storage.foldername(name))[2]
            and v.user_id::text = (storage.foldername(name))[1]
        )
      )
    )
  );

drop policy if exists "users can update own viewing media" on storage.objects;
drop policy if exists "owners and editors can update viewing media" on storage.objects;
create policy "owners and editors can update viewing media"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'viewing-media'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (
        private.viewing_role(private.storage_viewing_id(name)) = 'editor'
        and exists (
          select 1 from public.viewings v
          where v.id::text = (storage.foldername(name))[2]
            and v.user_id::text = (storage.foldername(name))[1]
        )
      )
    )
  )
  with check (
    bucket_id = 'viewing-media'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (
        private.viewing_role(private.storage_viewing_id(name)) = 'editor'
        and exists (
          select 1 from public.viewings v
          where v.id::text = (storage.foldername(name))[2]
            and v.user_id::text = (storage.foldername(name))[1]
        )
      )
    )
  );
