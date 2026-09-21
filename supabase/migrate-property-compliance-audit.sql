-- Property compliance audit trail (service_role only).
-- Apply after migrate-property-domain.sql.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.property_data_audit (
  id uuid primary key default gen_random_uuid(),
  actor text,
  action text not null
    check (action in ('generate', 'read', 'erase', 'purge_expired', 'llm_export')),
  report_id uuid,
  cache_key_hash text,
  country_code text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists property_data_audit_created_at_idx
  on private.property_data_audit (created_at desc);

create index if not exists property_data_audit_action_idx
  on private.property_data_audit (action);

create index if not exists property_data_audit_report_id_idx
  on private.property_data_audit (report_id)
  where report_id is not null;

comment on table private.property_data_audit is
  'Compliance audit for property-report generate/read/erase/purge/llm_export. Service role only.';

revoke all on private.property_data_audit from public, anon, authenticated;
grant select, insert on private.property_data_audit to service_role;
