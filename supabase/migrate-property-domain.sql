-- Property domain persistence (canonical report + evidence rows).
-- Server-only via service_role; aligns with private.property_intel_cache pattern.
-- Apply after migrate-property-intel-cache.sql / migrate-properties-multicountry.sql.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

-- Full API / domain report snapshots (envelope jsonb).
create table if not exists private.property_domain_reports (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties (id) on delete set null,
  cache_key text not null,
  normalized_address text not null,
  country_code text not null default 'OTHER',
  schema_version text not null default 'property-report-api/v1',
  report jsonb not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint property_domain_reports_schema_version_chk
    check (schema_version in ('property-domain/v1', 'property-report-api/v1'))
);

-- Evidence rows for audit / citation (scoped to report when present).
create table if not exists private.property_evidence (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references private.property_domain_reports (id) on delete cascade,
  property_id uuid references public.properties (id) on delete set null,
  evidence_id text not null,
  field_path text not null,
  payload jsonb not null,
  confidence double precision,
  retrieved_at timestamptz,
  effective_date date,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint property_evidence_confidence_chk
    check (confidence is null or (confidence >= 0 and confidence <= 1))
);

-- Idempotent upgrades when tables already existed from an earlier draft.
alter table private.property_evidence
  add column if not exists report_id uuid references private.property_domain_reports (id) on delete cascade;

alter table private.property_domain_reports
  drop constraint if exists property_domain_reports_schema_version_chk;

alter table private.property_domain_reports
  add constraint property_domain_reports_schema_version_chk
  check (schema_version in ('property-domain/v1', 'property-report-api/v1'));

-- Allow multiple historical snapshots per address (GET by report id).
drop index if exists private.property_domain_reports_cache_key_uidx;

create index if not exists property_domain_reports_cache_key_idx
  on private.property_domain_reports (cache_key);

create index if not exists property_domain_reports_expires_at_idx
  on private.property_domain_reports (expires_at);

create index if not exists property_domain_reports_normalized_address_idx
  on private.property_domain_reports (normalized_address);

create index if not exists property_domain_reports_country_code_idx
  on private.property_domain_reports (country_code);

create index if not exists property_domain_reports_created_by_idx
  on private.property_domain_reports (created_by)
  where created_by is not null;

create unique index if not exists property_evidence_report_evidence_id_uidx
  on private.property_evidence (report_id, evidence_id)
  where report_id is not null;

create unique index if not exists property_evidence_property_evidence_id_uidx
  on private.property_evidence (property_id, evidence_id)
  where property_id is not null and report_id is null;

create index if not exists property_evidence_evidence_id_idx
  on private.property_evidence (evidence_id);

create index if not exists property_evidence_report_id_idx
  on private.property_evidence (report_id);

create index if not exists property_evidence_expires_at_idx
  on private.property_evidence (expires_at);

create index if not exists property_evidence_field_path_idx
  on private.property_evidence (field_path);

comment on table private.property_evidence is
  'Normalized evidence citations for property-domain / property-report API snapshots.';

comment on table private.property_domain_reports is
  'Cached report API envelopes (schema_version property-report-api/v1) or legacy domain JSON.';

-- Optional place_id on public hub (no provenance columns on wide table).
alter table public.properties
  add column if not exists place_id text;

create index if not exists properties_place_id_idx
  on public.properties (place_id)
  where place_id is not null;

comment on column public.properties.place_id is
  'Optional Google / geocoder place id; provenance lives in private.property_evidence';

revoke all on private.property_evidence from public, anon, authenticated;
grant select, insert, update, delete on private.property_evidence to service_role;

revoke all on private.property_domain_reports from public, anon, authenticated;
grant select, insert, update, delete on private.property_domain_reports to service_role;
