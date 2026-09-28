-- Forward hardening for the share token vault. Does not edit applied migrations.

alter table public.share_links
  drop constraint if exists share_links_active_requires_ciphertext;
alter table public.share_links
  add constraint share_links_active_requires_ciphertext
  check (status <> 'active' or token_ciphertext is not null);

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
        or not coalesce((item ->> 'path') = any(v.photo_urls), false)
    )
  limit 1;
$$;

create or replace function public.share_links_guard_vault()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'revoked' then
    new.token_ciphertext := null;
  end if;
  if tg_op = 'UPDATE' and old.token_key_id is distinct from new.token_key_id then
    raise exception 'token_key_id is immutable';
  end if;
  if tg_op = 'UPDATE' and old.token_hash is distinct from new.token_hash then
    raise exception 'token_hash changes only through a new share row';
  end if;
  if tg_op = 'UPDATE'
    and old.status = 'active'
    and new.status = 'active'
    and old.token_ciphertext is distinct from new.token_ciphertext then
    raise exception 'share token ciphertext is immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.resolve_share_publication(text) from public, anon, authenticated, service_role;
revoke all on function public.resolve_share_publication_by_hash(text) from public, anon, authenticated;
grant execute on function public.resolve_share_publication_by_hash(text) to service_role;
