-- Per-recipient share codes: multiple active links per viewing, optional recipient_label.

alter table public.share_links
  add column if not exists recipient_label text;

comment on column public.share_links.recipient_label is
  'Display name for a named recipient/group code; null = general (anonymous) link.';

alter table public.share_links
  drop constraint if exists share_links_recipient_label_len;

alter table public.share_links
  add constraint share_links_recipient_label_len
  check (
    recipient_label is null
    or char_length(btrim(recipient_label)) between 1 and 40
  );

-- Allow N active links per viewing (named + one general).
drop index if exists public.share_links_one_active_per_viewing_uidx;

-- At most one general (unnamed) active link per viewing.
create unique index if not exists share_links_one_general_active_per_viewing_uidx
  on public.share_links (viewing_id)
  where status = 'active'
    and revoked_at is null
    and recipient_label is null;

-- Named labels unique per viewing among active links (case-insensitive).
create unique index if not exists share_links_recipient_label_active_uidx
  on public.share_links (viewing_id, lower(btrim(recipient_label)))
  where status = 'active'
    and revoked_at is null
    and recipient_label is not null;

-- Rotate: copy recipient_label onto the replacement row.
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
  v_label text;
  v_row public.share_links;
begin
  select sl.viewing_id, sl.recipient_label into v_viewing, v_label
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
    media_manifest,
    recipient_label
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
    coalesce(p_manifest, '[]'::jsonb),
    v_label
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

-- Fan-out republication across all active (non-revoked) links for a viewing.
create or replace function public.republish_viewing_share_links(
  p_viewing_id uuid,
  p_user_id uuid,
  p_snapshot jsonb,
  p_manifest jsonb
)
returns setof public.share_links
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owned boolean;
begin
  if p_snapshot is null or jsonb_typeof(p_snapshot) is distinct from 'object' then
    raise exception 'SHARE_SNAPSHOT_INVALID';
  end if;
  if p_manifest is null or jsonb_typeof(p_manifest) is distinct from 'array' then
    raise exception 'SHARE_MANIFEST_INVALID';
  end if;

  select exists (
    select 1
    from public.viewings v
    where v.id = p_viewing_id
      and v.user_id = p_user_id
  ) into v_owned;

  if not v_owned then
    return;
  end if;

  return query
  update public.share_links sl
  set
    published_snapshot = p_snapshot,
    media_manifest = p_manifest,
    updated_at = clock_timestamp()
  where sl.viewing_id = p_viewing_id
    and sl.status = 'active'
    and sl.revoked_at is null
  returning sl.*;
end;
$$;

revoke all on function public.republish_viewing_share_links(uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.republish_viewing_share_links(uuid, uuid, jsonb, jsonb)
  to service_role;
