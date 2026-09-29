-- Not applied on any database yet.
-- Apply on the dev database first, verify properties are not readable by
-- anon or authenticated, then apply on production.
-- The policy is currently inert because those roles have no table privileges.
-- Dropping it prevents a later GRANT from exposing every property row.

drop policy if exists "anyone can read properties" on public.properties;
