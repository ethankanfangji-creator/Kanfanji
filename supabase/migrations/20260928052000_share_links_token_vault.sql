-- Viewing share tokens are stored as SHA-256 plus AES-GCM ciphertext.
-- Existing plaintext tokens are hashed, then cleared. Ciphertext stays null
-- until the owner regenerates the link. Does not modify earlier migrations.

alter table public.share_links
  add column if not exists token_hash text,
  add column if not exists token_ciphertext text,
  add column if not exists token_key_id text not null default 'v1';

update public.share_links
set token_hash = encode(extensions.digest(convert_to(token, 'utf8'), 'sha256'), 'hex')
where token is not null
  and token_hash is null;

alter table public.share_links
  alter column token drop not null;

update public.share_links set token = null where token is not null;

alter table public.share_links
  drop constraint if exists share_links_token_hash_format;
alter table public.share_links
  add constraint share_links_token_hash_format
  check (token_hash is null or token_hash ~ '^[a-f0-9]{64}$');

create unique index if not exists share_links_token_hash_uidx
  on public.share_links (token_hash)
  where token_hash is not null;

create or replace function public.share_links_guard_vault()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'revoked' then
    new.token_ciphertext := null;
  elsif tg_op = 'UPDATE'
    and old.token_hash is not distinct from new.token_hash
    and old.token_ciphertext is distinct from new.token_ciphertext
    and old.status = 'active'
    and new.status = 'active' then
    raise exception 'share token ciphertext is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists share_links_guard_vault on public.share_links;
create trigger share_links_guard_vault
  before update on public.share_links
  for each row
  execute function public.share_links_guard_vault();

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
  limit 1;
$$;

create or replace function public.rotate_share_link(
  p_link_id uuid,
  p_user_id uuid,
  p_token_hash text,
  p_token_ciphertext text
)
returns public.share_links
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.share_links;
begin
  update public.share_links sl
  set token = null,
      token_hash = p_token_hash,
      token_ciphertext = p_token_ciphertext,
      token_key_id = 'v1',
      updated_at = clock_timestamp()
  from public.viewings v
  where sl.id = p_link_id
    and sl.viewing_id = v.id
    and v.user_id = p_user_id
    and sl.status = 'active'
  returning sl.* into v_row;
  return v_row;
end;
$$;

revoke all on function public.resolve_share_publication_by_hash(text) from public, anon, authenticated;
revoke all on function public.rotate_share_link(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.resolve_share_publication_by_hash(text) to service_role;
grant execute on function public.rotate_share_link(uuid, uuid, text, text) to service_role;
revoke all on function public.rotate_share_link(uuid, uuid, text) from public, anon, authenticated;
