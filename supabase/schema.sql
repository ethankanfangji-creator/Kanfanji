-- Full schema for new projects (auth-isolated).

create extension if not exists "pgcrypto";

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

create table if not exists public.viewings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  address text not null,
  tags text[] not null default '{}',
  market text,
  questions jsonb not null default '[]'::jsonb,
  photo_urls text[] not null default '{}',
  video_urls text[] not null default '{}',
  audio_urls text[] not null default '{}',
  notes jsonb not null default '[]'::jsonb,
  pros text[] not null default '{}',
  risks text[] not null default '{}',
  share_token text,
  client_updated_at timestamptz,
  property jsonb not null default '{}'::jsonb,
  is_pro boolean not null default false,
  property_id uuid references public.properties (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists viewings_share_token_uidx
  on public.viewings (share_token)
  where share_token is not null;

create index if not exists viewings_user_id_idx on public.viewings (user_id);
create index if not exists viewings_property_id_idx on public.viewings (property_id);

alter table public.viewings enable row level security;

drop policy if exists "users can select own viewings" on public.viewings;
create policy "users can select own viewings"
  on public.viewings for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users can insert own viewings" on public.viewings;
create policy "users can insert own viewings"
  on public.viewings for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "users can update own viewings" on public.viewings;
create policy "users can update own viewings"
  on public.viewings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users can delete own viewings" on public.viewings;
create policy "users can delete own viewings"
  on public.viewings for delete to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text unique,
  status text not null default 'inactive',
  plan text,
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_stripe_customer_id_idx
  on public.subscriptions (stripe_customer_id);

alter table public.subscriptions enable row level security;

drop policy if exists "users can select own subscription" on public.subscriptions;
create policy "users can select own subscription"
  on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;

insert into storage.buckets (id, name, public)
values ('viewing-media', 'viewing-media', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "users can upload own viewing media" on storage.objects;
create policy "users can upload own viewing media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'viewing-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "users can update own viewing media" on storage.objects;
create policy "users can update own viewing media"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'viewing-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'viewing-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "public can read viewing media" on storage.objects;

drop policy if exists "users can read own viewing media" on storage.objects;
create policy "users can read own viewing media"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'viewing-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create or replace function public.get_viewing_by_share_token(p_token text)
returns setof public.viewings
language sql
security definer
set search_path = public
as $$
  select *
  from public.viewings
  where share_token is not null
    and share_token = nullif(trim(p_token), '')
  limit 1;
$$;

revoke all on function public.get_viewing_by_share_token(text) from public;
grant execute on function public.get_viewing_by_share_token(text) to anon, authenticated, service_role;
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
