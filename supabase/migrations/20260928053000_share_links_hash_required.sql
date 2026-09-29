-- Follow-up after share_links_token_vault. Dev had zero rows, so the hash can
-- be required. The old plaintext rotate signature is no longer callable.

alter table public.share_links
  alter column token_hash set not null;

revoke all on function public.rotate_share_link(uuid, uuid, text) from public, anon, authenticated, service_role;
