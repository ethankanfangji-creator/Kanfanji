-- Properties registry + viewings.property_id (community prep / address dedupe)

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  normalized_address text not null,
  lat double precision,
  lng double precision,
  year_built integer,
  zoning text,
  view_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint properties_normalized_address_key unique (normalized_address)
);

create index if not exists properties_lat_lng_idx
  on public.properties (lat, lng)
  where lat is not null and lng is not null;

alter table public.properties enable row level security;

drop policy if exists "anyone can read properties" on public.properties;
create policy "anyone can read properties"
  on public.properties for select
  to anon, authenticated
  using (true);

grant select on public.properties to anon, authenticated;
grant all on public.properties to service_role;

alter table public.viewings
  add column if not exists property_id uuid references public.properties (id) on delete set null;

create index if not exists viewings_property_id_idx on public.viewings (property_id);

create or replace function public.find_or_create_property(
  p_normalized_address text,
  p_lat double precision,
  p_lng double precision,
  p_zoning text default null,
  p_year_built integer default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_norm text := lower(trim(both from p_normalized_address));
begin
  if v_norm is null or v_norm = '' then
    raise exception 'normalized_address required';
  end if;

  select id into v_id
  from public.properties
  where lower(normalized_address) = v_norm
  limit 1;

  if v_id is not null then
    update public.properties
      set view_count = view_count + 1,
          updated_at = now(),
          zoning = coalesce(zoning, p_zoning),
          year_built = coalesce(year_built, p_year_built)
    where id = v_id;
    return v_id;
  end if;

  if p_lat is not null and p_lng is not null then
    select id into v_id
    from public.properties
    where lat is not null
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
            year_built = coalesce(year_built, p_year_built)
      where id = v_id;
      return v_id;
    end if;
  end if;

  insert into public.properties (
    normalized_address, lat, lng, zoning, year_built, view_count
  )
  values (v_norm, p_lat, p_lng, p_zoning, p_year_built, 1)
  on conflict (normalized_address) do update
    set view_count = public.properties.view_count + 1,
        updated_at = now(),
        zoning = coalesce(public.properties.zoning, excluded.zoning),
        year_built = coalesce(public.properties.year_built, excluded.year_built),
        lat = coalesce(public.properties.lat, excluded.lat),
        lng = coalesce(public.properties.lng, excluded.lng)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.find_or_create_property(text, double precision, double precision, text, integer) from public;
grant execute on function public.find_or_create_property(text, double precision, double precision, text, integer)
  to anon, authenticated, service_role;
