-- Property intel snapshot for Viewing Chat (BC + Places + Bing snippets).

alter table public.viewings
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.viewings.metadata is
  'Property intelligence snapshot (basic/history/location/risks) from /api/property-intel.';

grant select (metadata) on table public.viewings to authenticated;
grant insert (metadata) on table public.viewings to authenticated;
grant update (metadata) on table public.viewings to authenticated;
