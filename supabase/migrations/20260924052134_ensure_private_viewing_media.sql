-- Ensure viewing-media stays private and is never world-readable.
-- Idempotent: safe on prod/dev where migrate-notes-share-private-media already ran.
-- Collaboration member/editor policies (when present) remain; this hardens publicity
-- and restores owner-path policies if missing.

insert into storage.buckets (id, name, public)
values ('viewing-media', 'viewing-media', false)
on conflict (id) do update
set public = false,
    name = excluded.name;

update storage.buckets
set public = false
where id = 'viewing-media';

-- Legacy public-read policies (names from earlier auth-rls / notes migrations)
drop policy if exists "public can read viewing media" on storage.objects;
drop policy if exists "Public read access" on storage.objects;
drop policy if exists "Anyone can view viewing-media" on storage.objects;

-- Owner-path policies (idempotent recreate). Member/editor policies from
-- migrate-viewing-collaboration.sql are additive and kept separately.
drop policy if exists "users can read own viewing media" on storage.objects;
create policy "users can read own viewing media"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'viewing-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "users can upload own viewing media" on storage.objects;
create policy "users can upload own viewing media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'viewing-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "users can update own viewing media" on storage.objects;
create policy "users can update own viewing media"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'viewing-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'viewing-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
