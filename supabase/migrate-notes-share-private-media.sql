-- Notes / pros / risks / audio + share links + private media + LWW timestamp.
-- Backward compatible: additive columns; existing public media URLs still readable via path extraction.

alter table public.viewings
  add column if not exists notes jsonb not null default '[]'::jsonb;

alter table public.viewings
  add column if not exists pros text[] not null default '{}';

alter table public.viewings
  add column if not exists risks text[] not null default '{}';

alter table public.viewings
  add column if not exists audio_urls text[] not null default '{}';

alter table public.viewings
  add column if not exists share_token text;

alter table public.viewings
  add column if not exists client_updated_at timestamptz;

-- Unique share token when present
create unique index if not exists viewings_share_token_uidx
  on public.viewings (share_token)
  where share_token is not null;

create index if not exists viewings_client_updated_at_idx
  on public.viewings (client_updated_at);

-- Public share lookup (token only; no user_id leak beyond returned row)
create or replace function public.get_viewing_by_share_token(p_token text)
returns setof public.viewings
language sql
security definer
set search_path = public
as $$
  select *
  from public.viewings
  where share_token is not null
    and share_token = nullif(trim(p_token), '')
  limit 1;
$$;

revoke all on function public.get_viewing_by_share_token(text) from public;
grant execute on function public.get_viewing_by_share_token(text) to anon, authenticated, service_role;

-- Make viewing-media private
update storage.buckets
set public = false
where id = 'viewing-media';

drop policy if exists "public can read viewing media" on storage.objects;

drop policy if exists "users can read own viewing media" on storage.objects;
create policy "users can read own viewing media"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'viewing-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Ensure upload / update policies still exist (idempotent recreate)
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
