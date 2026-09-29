-- Rotate a chat share inside one transaction: revoke the old row, then insert
-- the replacement. A failed insert rolls back the revoke, so the old link stays active.

create or replace function public.rotate_chat_share_link(
  p_old_id uuid,
  p_user_id uuid,
  p_new_id uuid,
  p_token_hash text,
  p_token_ciphertext text,
  p_expires_at timestamptz,
  p_snapshot jsonb,
  p_manifest jsonb
)
returns public.share_links
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_viewing uuid;
  v_row public.share_links;
begin
  select sl.viewing_id into v_viewing
  from public.share_links sl
  join public.viewings v on v.id = sl.viewing_id
  where sl.id = p_old_id
    and v.user_id = p_user_id
    and sl.status = 'active'
    and sl.revoked_at is null
  for update of sl;

  if v_viewing is null then
    raise exception 'LINK_NOT_FOUND';
  end if;

  update public.share_links
  set status = 'revoked',
      revoked_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = p_old_id;

  insert into public.share_links (
    id,
    viewing_id,
    token,
    token_hash,
    token_ciphertext,
    token_key_id,
    expires_at,
    published_snapshot,
    media_manifest
  )
  values (
    p_new_id,
    v_viewing,
    null,
    p_token_hash,
    p_token_ciphertext,
    'v1',
    p_expires_at,
    p_snapshot,
    coalesce(p_manifest, '[]'::jsonb)
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.rotate_chat_share_link(
  uuid, uuid, uuid, text, text, timestamptz, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.rotate_chat_share_link(
  uuid, uuid, uuid, text, text, timestamptz, jsonb, jsonb
) to service_role;
