-- Immutable history of generated viewing reports.
-- viewings.report remains the latest pointer for fast reads / share.

create table if not exists public.viewing_report_versions (
  id uuid primary key default gen_random_uuid(),
  viewing_id uuid not null references public.viewings (id) on delete cascade,
  version integer not null check (version > 0),
  snapshot jsonb not null,
  notes_fingerprint text not null,
  source text not null default 'notes_report',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (viewing_id, version)
);

create index if not exists viewing_report_versions_viewing_created_idx
  on public.viewing_report_versions (viewing_id, created_at desc);

alter table public.viewing_report_versions enable row level security;

drop policy if exists "owners can read report versions" on public.viewing_report_versions;
create policy "owners can read report versions"
  on public.viewing_report_versions for select to authenticated
  using (
    exists (
      select 1
      from public.viewings v
      where v.id = viewing_id
        and v.user_id = (select auth.uid())
    )
  );

revoke all on table public.viewing_report_versions from public, anon, authenticated;
grant select on table public.viewing_report_versions to authenticated;
grant all on table public.viewing_report_versions to service_role;
