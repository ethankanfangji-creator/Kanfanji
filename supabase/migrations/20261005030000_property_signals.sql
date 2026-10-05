-- Anonymous per-property aggregates for future recommendations.
-- Counts only — no notes, addresses, or user identifiers.

create table if not exists public.property_signals (
  property_id uuid primary key references public.properties (id) on delete cascade,
  viewing_count integer not null default 0 check (viewing_count >= 0),
  unique_viewer_count integer not null default 0 check (unique_viewer_count >= 0),
  liked_count integer not null default 0 check (liked_count >= 0),
  shortlist_count integer not null default 0 check (shortlist_count >= 0),
  passed_count integer not null default 0 check (passed_count >= 0),
  revisit_count integer not null default 0 check (revisit_count >= 0),
  decision_set_count integer not null default 0 check (decision_set_count >= 0),
  last_viewing_at timestamptz,
  refreshed_at timestamptz not null default now(),
  constraint property_signals_decision_sum_chk check (
    decision_set_count = liked_count + shortlist_count + passed_count + revisit_count
  ),
  constraint property_signals_decision_lte_viewings_chk check (
    decision_set_count <= viewing_count
  ),
  constraint property_signals_viewers_lte_viewings_chk check (
    unique_viewer_count <= viewing_count
  )
);

comment on table public.property_signals is
  'Anonymous aggregates per property (viewing/decision counts). Service-role only.';

create index if not exists property_signals_refreshed_idx
  on public.property_signals (refreshed_at desc);

create index if not exists property_signals_viewing_count_idx
  on public.property_signals (viewing_count desc);

alter table public.property_signals enable row level security;

revoke all on table public.property_signals from public, anon, authenticated;
grant all on table public.property_signals to service_role;
