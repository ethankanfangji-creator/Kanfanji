-- Shared property-intel cache (Google/Bing/OSM cost control).
-- Server-only via service_role; never expose to anon/authenticated.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.property_intel_cache (
  cache_key text primary key,
  normalized_address text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists property_intel_cache_expires_at_idx
  on private.property_intel_cache (expires_at);

create index if not exists property_intel_cache_normalized_address_idx
  on private.property_intel_cache (normalized_address);

revoke all on private.property_intel_cache from public, anon, authenticated;
grant select, insert, update, delete on private.property_intel_cache to service_role;

comment on table private.property_intel_cache is
  'Cached /api/property-intel payloads keyed by sha256(canonical address). TTL via expires_at.';
