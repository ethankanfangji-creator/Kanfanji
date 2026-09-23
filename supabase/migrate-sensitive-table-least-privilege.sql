-- Additive forward fix for inherited/default table grants.
-- RLS remains enabled, but table privileges are narrowed independently.

alter table public.viewings enable row level security;
alter table public.properties enable row level security;
alter table public.subscriptions enable row level security;
alter table public.viewing_members enable row level security;
alter table public.viewing_invites enable row level security;
alter table public.viewing_comments enable row level security;
alter table public.viewing_audit_events enable row level security;

revoke all privileges on table
  public.viewings,
  public.properties,
  public.subscriptions,
  public.viewing_members,
  public.viewing_invites,
  public.viewing_comments,
  public.viewing_audit_events
from public, anon, authenticated;

-- Browser sync creates and revision-CAS updates owner/member rows. RLS and the
-- update guard continue to constrain which rows and protected fields may change.
grant insert (
  user_id,
  idempotency_key,
  revision,
  address,
  tags,
  market,
  questions,
  photo_urls,
  video_urls,
  audio_urls,
  notes,
  pros,
  risks,
  client_updated_at,
  property,
  is_pro,
  property_id,
  updated_at
) on table public.viewings to authenticated;
grant update (
  user_id,
  idempotency_key,
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
  is_pro,
  property_id,
  updated_at
) on table public.viewings to authenticated;
grant select (
  id,
  user_id,
  property_id,
  idempotency_key,
  revision,
  address,
  tags,
  market,
  questions,
  pros,
  risks,
  photo_urls,
  video_urls,
  client_updated_at,
  is_pro,
  created_at,
  updated_at
) on table public.viewings to authenticated;

-- ClientPage reads only the signed-in user's current plan state. RLS enforces
-- user_id = auth.uid(); Stripe identifiers and webhook ordering stay server-only.
grant select (
  user_id,
  status,
  plan
) on table public.subscriptions to authenticated;

-- Property dedupe and every collaboration/share mutation use server-side
-- service-role clients after authenticated identity/role checks.
grant all privileges on table
  public.viewings,
  public.properties,
  public.subscriptions,
  public.viewing_members,
  public.viewing_invites,
  public.viewing_comments,
  public.viewing_audit_events
to service_role;
