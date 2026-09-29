-- Matches the vault hardening applied on dev (check + revoke the plaintext resolver).
-- The ciphertext check is NOT VALID so existing active rows without a ciphertext
-- stay readable. New inserts and updates are still checked.

alter table public.share_links
  drop constraint if exists share_links_active_requires_ciphertext;

alter table public.share_links
  add constraint share_links_active_requires_ciphertext
  check (status <> 'active' or token_ciphertext is not null) not valid;

revoke all on function public.resolve_share_publication(text) from public, anon, authenticated, service_role;
