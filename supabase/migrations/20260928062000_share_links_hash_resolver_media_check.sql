-- Hash resolver also checks that manifest paths belong to the viewing photos.
-- Matches the resolver applied on dev after the initial vault hardening.

create or replace function public.resolve_share_publication_by_hash(p_token_hash text)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object('shareLink', to_jsonb(sl), 'ownerId', v.user_id)
  from public.share_links sl
  join public.viewings v on v.id = sl.viewing_id
  where sl.token_hash = p_token_hash
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
        or (item ->> 'path') not like v.user_id::text || '/' || v.id::text || '/photos/%'
        or not coalesce((item ->> 'path') = any (v.photo_urls), false)
    )
  limit 1;
$$;

revoke all on function public.resolve_share_publication_by_hash(text) from public, anon, authenticated;
grant execute on function public.resolve_share_publication_by_hash(text) to service_role;
