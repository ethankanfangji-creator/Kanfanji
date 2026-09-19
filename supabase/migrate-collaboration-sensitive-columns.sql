-- Follow-up hardening: sensitive collaboration fields must not be readable
-- directly through PostgREST. Server routes perform role checks and projection.

revoke select on public.viewings from authenticated;
grant select (
  id,
  user_id,
  property_id,
  address,
  tags,
  market,
  questions,
  pros,
  risks,
  photo_urls,
  video_urls,
  client_updated_at,
  is_pro,
  created_at,
  updated_at,
  revision
) on public.viewings to authenticated;

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

