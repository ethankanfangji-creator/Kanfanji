-- Owner scope for property-report snapshots so HTTP erase cannot wipe
-- another user's snapshots or the shared intel cache by address / reportId.
-- Apply after migrate-property-domain.sql. Idempotent if that file already
-- added created_by.

alter table private.property_domain_reports
  add column if not exists created_by uuid references auth.users (id) on delete set null;

create index if not exists property_domain_reports_created_by_idx
  on private.property_domain_reports (created_by)
  where created_by is not null;

comment on column private.property_domain_reports.created_by is
  'Authenticated user who generated the snapshot; HTTP erase is scoped to this owner.';
