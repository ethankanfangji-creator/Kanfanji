-- Retire share-password unlock path (app no longer writes/unlocks passwords).
-- Keep share_links.password_hash / expires_at / viewings.share_token columns for a soak;
-- clear leftover hashes and drop unlock limiter + unused rotate_share_link overloads.
-- Authority remains token_hash + token_ciphertext + rotate_chat_share_link + soft-close.

update public.share_links
set password_hash = null
where password_hash is not null;

drop function if exists public.consume_share_unlock_attempt(text);
drop table if exists public.share_unlock_limits;

-- Legacy rotate overloads (plaintext + early vault). App uses rotate_chat_share_link only.
drop function if exists public.rotate_share_link(uuid, uuid, text);
drop function if exists public.rotate_share_link(uuid, uuid, text, text);
