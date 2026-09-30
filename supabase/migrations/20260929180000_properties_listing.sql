alter table public.properties
  add column if not exists listing jsonb not null default '{}'::jsonb;

alter table public.properties
  drop constraint if exists properties_listing_size;

alter table public.properties
  add constraint properties_listing_size
  check (pg_column_size(listing) <= 65536);
