-- Unit-aware property identity: (country_code, street normalized_address, unit_key).
-- Removes 500m proximity soft-merge so different units in one building stay distinct.

alter table public.properties
  add column if not exists unit_key text not null default '';

alter table public.properties
  add column if not exists unit_label text;

comment on column public.properties.unit_key is
  'Canonical unit token; empty string when no unit is specified';
comment on column public.properties.unit_label is
  'Display unit label (Unit 5 / 5樓 / Apt 12)';
comment on column public.properties.normalized_address is
  'Street-level normalized address WITHOUT unit tokens';

-- Best-effort rekey: peel common English unit prefixes from normalized_address.
update public.properties
set
  unit_label = coalesce(
    unit_label,
    trim(substring(normalized_address from '^(unit\s*#?\s*[\w-]+|apt\.?\s*#?\s*[\w-]+|suite\s*#?\s*[\w-]+|#\s*[\w-]+)'))
  ),
  unit_key = case
    when unit_key <> '' then unit_key
    when normalized_address ~* '^unit\s*#?\s*([\w-]+)'
      then lower(substring(normalized_address from '(?i)^unit\s*#?\s*([\w-]+)'))
    when normalized_address ~* '^apt\.?\s*#?\s*([\w-]+)'
      then lower(substring(normalized_address from '(?i)^apt\.?\s*#?\s*([\w-]+)'))
    when normalized_address ~* '^suite\.?\s*#?\s*([\w-]+)'
      then lower(substring(normalized_address from '(?i)^suite\.?\s*#?\s*([\w-]+)'))
    when normalized_address ~* '^#\s*([\w-]+)'
      then lower(substring(normalized_address from '(?i)^#\s*([\w-]+)'))
    else ''
  end,
  normalized_address = trim(both ' ,' from regexp_replace(
    normalized_address,
    '^(unit\s*#?\s*[\w-]+|apt\.?\s*#?\s*[\w-]+|suite\s*#?\s*[\w-]+|#\s*[\w-]+)\s*,?\s*',
    '',
    'i'
  ))
where normalized_address ~* '^(unit\s*#?\s*[\w-]+|apt\.?\s*#?\s*[\w-]+|suite\s*#?\s*[\w-]+|#\s*[\w-]+)';

-- Merge rows that collide on the new identity (keep oldest id).
with ranked as (
  select
    id,
    country_code,
    normalized_address,
    unit_key,
    view_count,
    row_number() over (
      partition by country_code, normalized_address, unit_key
      order by created_at asc, id asc
    ) as rn,
    first_value(id) over (
      partition by country_code, normalized_address, unit_key
      order by created_at asc, id asc
    ) as keep_id
  from public.properties
),
dupes as (
  select id as drop_id, keep_id, view_count
  from ranked
  where rn > 1
)
update public.viewings v
set property_id = d.keep_id
from dupes d
where v.property_id = d.drop_id;

with ranked as (
  select
    id,
    country_code,
    normalized_address,
    unit_key,
    view_count,
    row_number() over (
      partition by country_code, normalized_address, unit_key
      order by created_at asc, id asc
    ) as rn,
    first_value(id) over (
      partition by country_code, normalized_address, unit_key
      order by created_at asc, id asc
    ) as keep_id
  from public.properties
),
dupes as (
  select id as drop_id, keep_id, view_count
  from ranked
  where rn > 1
),
sums as (
  select keep_id, sum(view_count) as extra
  from dupes
  group by keep_id
)
update public.properties p
set view_count = p.view_count + s.extra,
    updated_at = now()
from sums s
where p.id = s.keep_id;

with ranked as (
  select
    id,
    row_number() over (
      partition by country_code, normalized_address, unit_key
      order by created_at asc, id asc
    ) as rn
  from public.properties
)
delete from public.properties p
using ranked r
where p.id = r.id
  and r.rn > 1;

drop index if exists public.properties_country_normalized_address_key;
drop index if exists public.properties_normalized_address_key;
alter table public.properties
  drop constraint if exists properties_normalized_address_key;

create unique index if not exists properties_country_street_unit_key
  on public.properties (country_code, normalized_address, unit_key);

-- Drop prior overloads, then install unit-aware RPC (no proximity merge).
drop function if exists public.find_or_create_property(text, double precision, double precision, text, integer);
drop function if exists public.find_or_create_property(text, double precision, double precision, text, integer, text, text, text, text);
drop function if exists public.find_or_create_property(text, double precision, double precision, text, integer, text, text, text, text, text, text, text);

create or replace function public.find_or_create_property(
  p_normalized_address text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_zoning text default null,
  p_year_built integer default null,
  p_country_code text default null,
  p_admin1 text default null,
  p_city text default null,
  p_postal_code text default null,
  p_unit_key text default '',
  p_unit_label text default null,
  p_place_id text default null
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_norm text := pg_catalog.lower(pg_catalog.btrim(p_normalized_address));
  v_country text := pg_catalog.upper(pg_catalog.btrim(coalesce(nullif(p_country_code, ''), 'UNKNOWN')));
  v_unit text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_unit_key, '')));
  v_label text := nullif(pg_catalog.btrim(coalesce(p_unit_label, '')), '');
  v_place text := nullif(pg_catalog.btrim(coalesce(p_place_id, '')), '');
begin
  if v_norm is null
    or pg_catalog.char_length(v_norm) < 3
    or pg_catalog.char_length(v_norm) > 500
    or v_norm ~ '[[:cntrl:]]'
  then
    raise exception using
      errcode = '22023',
      message = 'invalid normalized_address';
  end if;

  if pg_catalog.char_length(v_unit) > 64
    or v_unit ~ '[[:cntrl:]]'
  then
    raise exception using
      errcode = '22023',
      message = 'invalid unit_key';
  end if;

  if (p_lat is null) <> (p_lng is null)
    or (p_lat is not null and (p_lat < -90 or p_lat > 90 or p_lat = 'NaN'::double precision))
    or (p_lng is not null and (p_lng < -180 or p_lng > 180 or p_lng = 'NaN'::double precision))
  then
    raise exception using
      errcode = '22023',
      message = 'invalid coordinates';
  end if;

  if p_year_built is not null
    and (
      p_year_built < 1000
      or p_year_built > pg_catalog.date_part('year', pg_catalog.now())::integer + 5
    )
  then
    raise exception using
      errcode = '22023',
      message = 'invalid year_built';
  end if;

  insert into public.properties (
    normalized_address, lat, lng, zoning, year_built, view_count,
    country_code, admin1, city, postal_code,
    unit_key, unit_label, place_id
  )
  values (
    v_norm, p_lat, p_lng, p_zoning, p_year_built, 1,
    v_country, nullif(p_admin1, ''), nullif(p_city, ''), nullif(p_postal_code, ''),
    v_unit, v_label, v_place
  )
  on conflict (country_code, normalized_address, unit_key) do update
    set view_count = public.properties.view_count + 1,
        updated_at = pg_catalog.now(),
        zoning = coalesce(public.properties.zoning, excluded.zoning),
        year_built = coalesce(public.properties.year_built, excluded.year_built),
        admin1 = coalesce(public.properties.admin1, excluded.admin1),
        city = coalesce(public.properties.city, excluded.city),
        postal_code = coalesce(public.properties.postal_code, excluded.postal_code),
        lat = coalesce(public.properties.lat, excluded.lat),
        lng = coalesce(public.properties.lng, excluded.lng),
        unit_label = coalesce(public.properties.unit_label, excluded.unit_label),
        place_id = coalesce(public.properties.place_id, excluded.place_id)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.find_or_create_property(
  text, double precision, double precision, text, integer,
  text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.find_or_create_property(
  text, double precision, double precision, text, integer,
  text, text, text, text, text, text, text
) to service_role;
