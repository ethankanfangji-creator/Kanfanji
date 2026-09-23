-- Multi-country property identity (US / CA / TW)

alter table public.properties
  add column if not exists country_code text,
  add column if not exists admin1 text,
  add column if not exists city text,
  add column if not exists postal_code text;

comment on column public.properties.country_code is 'ISO-like region code: CA, US, TW, or OTHER/UNKNOWN';
comment on column public.properties.admin1 is 'Province / state / 縣市';
comment on column public.properties.city is 'Locality / city';
comment on column public.properties.postal_code is 'Postal / ZIP code';

update public.properties
set country_code = 'UNKNOWN'
where country_code is null;

alter table public.properties
  alter column country_code set default 'UNKNOWN';

alter table public.properties
  alter column country_code set not null;

alter table public.properties
  drop constraint if exists properties_normalized_address_key;

drop index if exists properties_normalized_address_key;

create unique index if not exists properties_country_normalized_address_key
  on public.properties (country_code, normalized_address);

create index if not exists properties_country_code_idx
  on public.properties (country_code);

-- Replace RPC with country-aware signature (extra args default null for back-compat callers via named params)
drop function if exists public.find_or_create_property(text, double precision, double precision, text, integer);

create or replace function public.find_or_create_property(
  p_normalized_address text,
  p_lat double precision,
  p_lng double precision,
  p_zoning text default null,
  p_year_built integer default null,
  p_country_code text default null,
  p_admin1 text default null,
  p_city text default null,
  p_postal_code text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_norm text := lower(trim(both from p_normalized_address));
  v_country text := upper(trim(both from coalesce(nullif(p_country_code, ''), 'UNKNOWN')));
begin
  if v_norm is null or v_norm = '' then
    raise exception 'normalized_address required';
  end if;

  select id into v_id
  from public.properties
  where country_code = v_country
    and normalized_address = v_norm
  limit 1;

  if v_id is not null then
    update public.properties
      set view_count = view_count + 1,
          updated_at = now(),
          zoning = coalesce(zoning, p_zoning),
          year_built = coalesce(year_built, p_year_built),
          admin1 = coalesce(admin1, nullif(p_admin1, '')),
          city = coalesce(city, nullif(p_city, '')),
          postal_code = coalesce(postal_code, nullif(p_postal_code, '')),
          lat = coalesce(lat, p_lat),
          lng = coalesce(lng, p_lng)
    where id = v_id;
    return v_id;
  end if;

  if p_lat is not null and p_lng is not null then
    select id into v_id
    from public.properties
    where country_code = v_country
      and lat is not null
      and lng is not null
      and lat between p_lat - 0.01 and p_lat + 0.01
      and lng between p_lng - 0.01 and p_lng + 0.01
      and (
        6371000 * acos(
          least(
            1.0,
            greatest(
              -1.0,
              cos(radians(p_lat)) * cos(radians(lat))
                * cos(radians(lng) - radians(p_lng))
              + sin(radians(p_lat)) * sin(radians(lat))
            )
          )
        )
      ) <= 500
    order by (
      6371000 * acos(
        least(
          1.0,
          greatest(
            -1.0,
            cos(radians(p_lat)) * cos(radians(lat))
              * cos(radians(lng) - radians(p_lng))
            + sin(radians(p_lat)) * sin(radians(lat))
          )
        )
      )
    ) asc
    limit 1;

    if v_id is not null then
      update public.properties
        set view_count = view_count + 1,
            updated_at = now(),
            zoning = coalesce(zoning, p_zoning),
            year_built = coalesce(year_built, p_year_built),
            admin1 = coalesce(admin1, nullif(p_admin1, '')),
            city = coalesce(city, nullif(p_city, '')),
            postal_code = coalesce(postal_code, nullif(p_postal_code, ''))
      where id = v_id;
      return v_id;
    end if;
  end if;

  insert into public.properties (
    normalized_address, lat, lng, zoning, year_built, view_count,
    country_code, admin1, city, postal_code
  )
  values (
    v_norm, p_lat, p_lng, p_zoning, p_year_built, 1,
    v_country, nullif(p_admin1, ''), nullif(p_city, ''), nullif(p_postal_code, '')
  )
  on conflict (country_code, normalized_address) do update
    set view_count = public.properties.view_count + 1,
        updated_at = now(),
        zoning = coalesce(public.properties.zoning, excluded.zoning),
        year_built = coalesce(public.properties.year_built, excluded.year_built),
        admin1 = coalesce(public.properties.admin1, excluded.admin1),
        city = coalesce(public.properties.city, excluded.city),
        postal_code = coalesce(public.properties.postal_code, excluded.postal_code),
        lat = coalesce(public.properties.lat, excluded.lat),
        lng = coalesce(public.properties.lng, excluded.lng)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.find_or_create_property(text, double precision, double precision, text, integer, text, text, text, text) from public;
grant execute on function public.find_or_create_property(text, double precision, double precision, text, integer, text, text, text, text)
  to anon, authenticated, service_role;
