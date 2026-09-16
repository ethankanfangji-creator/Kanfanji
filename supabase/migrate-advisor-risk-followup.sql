-- Additive follow-up for already-applied property and share-hardening releases.
-- Apply after migrate-properties.sql and migrate-share-hardening.sql.

create or replace function public.find_or_create_property(
  p_normalized_address text,
  p_lat double precision,
  p_lng double precision,
  p_zoning text default null,
  p_year_built integer default null
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_norm text := pg_catalog.lower(pg_catalog.btrim(p_normalized_address));
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
    normalized_address, lat, lng, zoning, year_built, view_count
  )
  values (v_norm, p_lat, p_lng, p_zoning, p_year_built, 1)
  on conflict (normalized_address) do update
    set view_count = public.properties.view_count + 1,
        updated_at = pg_catalog.now(),
        zoning = coalesce(public.properties.zoning, excluded.zoning),
        year_built = coalesce(public.properties.year_built, excluded.year_built),
        lat = coalesce(public.properties.lat, excluded.lat),
        lng = coalesce(public.properties.lng, excluded.lng)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.find_or_create_property(text, double precision, double precision, text, integer)
  from public, anon, authenticated;
grant execute on function public.find_or_create_property(text, double precision, double precision, text, integer)
  to service_role;

-- Clients have no table privileges, and this explicit policy also makes the
-- intended deny-all RLS posture visible to database advisors. The existing
-- service-role-only SECURITY DEFINER RPC remains compatible.
drop policy if exists "deny client access to share unlock limits"
  on public.share_unlock_limits;
create policy "deny client access to share unlock limits"
  on public.share_unlock_limits
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on public.share_unlock_limits from public, anon, authenticated;
grant all on public.share_unlock_limits to service_role;
