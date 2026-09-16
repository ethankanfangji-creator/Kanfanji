-- Additive forward fix after migrate-share-hardening.sql.
-- Serializes owner security mutations and exposes only a service-role resolver
-- that validates frozen media against the owning viewing before every signing.

revoke all privileges on table public.share_links from public, anon, authenticated;
grant all privileges on table public.share_links to service_role;

create or replace function public.mutate_share_link_security(
  p_link_id uuid,
  p_user_id uuid,
  p_expected_access_version integer,
  p_set_expires boolean default false,
  p_expires_at timestamptz default null,
  p_set_password boolean default false,
  p_password_hash text default null,
  p_revoke boolean default false
)
returns setof public.share_links
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_link public.share_links;
  v_now timestamptz := clock_timestamp();
begin
  if p_user_id is null or p_expected_access_version is null
     or p_expected_access_version < 1 then
    raise exception 'invalid share mutation';
  end if;

  select sl.* into v_link
  from public.share_links sl
  join public.viewings v on v.id = sl.viewing_id
  where sl.id = p_link_id
    and sl.status = 'active'
    and sl.revoked_at is null
    and sl.access_version = p_expected_access_version
    and v.user_id = p_user_id
  for update of sl;

  if not found then
    return;
  end if;

  return query
  update public.share_links
  set expires_at = case when p_set_expires then p_expires_at else expires_at end,
      password_hash = case when p_set_password then p_password_hash else password_hash end,
      status = case when p_revoke then 'revoked' else status end,
      revoked_at = case when p_revoke then v_now else revoked_at end,
      access_version = access_version
        + case when p_set_password or p_revoke then 1 else 0 end,
      updated_at = v_now
  where id = p_link_id
    and access_version = p_expected_access_version
  returning *;
end;
$$;

revoke all on function public.mutate_share_link_security(
  uuid, uuid, integer, boolean, timestamptz, boolean, text, boolean
) from public, anon, authenticated;
grant execute on function public.mutate_share_link_security(
  uuid, uuid, integer, boolean, timestamptz, boolean, text, boolean
) to service_role;

create or replace function public.resolve_share_publication(p_token text)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'shareLink', to_jsonb(sl),
    'ownerId', v.user_id
  )
  from public.share_links sl
  join public.viewings v on v.id = sl.viewing_id
  where sl.token = p_token
    and sl.status = 'active'
    and sl.revoked_at is null
    and (sl.expires_at is null or sl.expires_at > clock_timestamp())
    and sl.published_snapshot is not null
    and jsonb_typeof(sl.media_manifest) = 'array'
    and not exists (
      select 1
      from jsonb_array_elements(sl.media_manifest) item
      where jsonb_typeof(item) is distinct from 'object'
        or jsonb_typeof(item -> 'id') is distinct from 'string'
        or jsonb_typeof(item -> 'path') is distinct from 'string'
        or (item ->> 'path') not like
          v.user_id::text || '/' || v.id::text || '/photos/%'
        or not coalesce((item ->> 'path') = any(v.photo_urls), false)
    )
  limit 1;
$$;

revoke all on function public.resolve_share_publication(text)
  from public, anon, authenticated;
grant execute on function public.resolve_share_publication(text) to service_role;
