-- Additive forward fix after migrate-sensitive-table-least-privilege.sql.
-- Browser updates never mutate identity, idempotency, billing, or property
-- association fields; inserts retain the existing create contract.

revoke update on table public.viewings from authenticated;
grant update (
  user_id,
  revision,
  address,
  tags,
  market,
  questions,
  notes,
  pros,
  risks,
  client_updated_at,
  property,
  updated_at
) on table public.viewings to authenticated;
