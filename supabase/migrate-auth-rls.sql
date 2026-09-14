-- Multi-user isolation: run in Supabase SQL Editor.

alter table public.viewings
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table public.viewings
  add column if not exists property jsonb not null default '{}'::jsonb;

create index if not exists viewings_user_id_idx on public.viewings (user_id);

alter table public.viewings enable row level security;

-- Remove open anon policies
drop policy if exists "anon can insert viewings" on public.viewings;
drop policy if exists "anon can select viewings" on public.viewings;
drop policy if exists "anon can update viewings" on public.viewings;

drop policy if exists "users can select own viewings" on public.viewings;
create policy "users can select own viewings"
  on public.viewings for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users can insert own viewings" on public.viewings;
create policy "users can insert own viewings"
  on public.viewings for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users can update own viewings" on public.viewings;
create policy "users can update own viewings"
  on public.viewings for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users can delete own viewings" on public.viewings;
create policy "users can delete own viewings"
  on public.viewings for delete to authenticated
  using (auth.uid() = user_id);

-- Storage: path must start with auth.uid()/...
drop policy if exists "anon can upload viewing media" on storage.objects;
drop policy if exists "anon can update viewing media" on storage.objects;
drop policy if exists "anon can read viewing media" on storage.objects;

drop policy if exists "users can upload own viewing media" on storage.objects;
create policy "users can upload own viewing media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'viewing-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users can update own viewing media" on storage.objects;
create policy "users can update own viewing media"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'viewing-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'viewing-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Keep public read so shareable photo/video URLs still work
drop policy if exists "public can read viewing media" on storage.objects;
create policy "public can read viewing media"
  on storage.objects for select
  using (bucket_id = 'viewing-media');
