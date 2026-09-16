-- Share links access control (draft migration — apply when ready).
-- Does NOT remove legacy viewings.share_token until cutover is verified.
-- See docs/share-access-security.md

create extension if not exists "pgcrypto";

create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  viewing_id uuid not null references public.viewings (id) on delete cascade,
  -- 64 hex chars from CSPRNG; unique when present
  token text not null,
  capability text not null default 'read' check (capability = 'read'),
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  expires_at timestamptz,
  -- scrypt$salt$hash or argon2 encoding — NEVER plaintext
  password_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_resolved_at timestamptz,
  constraint share_links_token_key unique (token)
);

create index if not exists share_links_viewing_id_idx
  on public.share_links (viewing_id);

create index if not exists share_links_active_token_idx
  on public.share_links (token)
  where status = 'active';

alter table public.share_links enable row level security;

-- Owners manage their links; anon has NO direct table access.
drop policy if exists "owners select share_links" on public.share_links;
create policy "owners select share_links"
  on public.share_links for select to authenticated
  using (
    exists (
      select 1 from public.viewings v
      where v.id = viewing_id and v.user_id = (select auth.uid())
    )
  );

drop policy if exists "owners insert share_links" on public.share_links;
create policy "owners insert share_links"
  on public.share_links for insert to authenticated
  with check (
    exists (
      select 1 from public.viewings v
      where v.id = viewing_id and v.user_id = (select auth.uid())
    )
  );

drop policy if exists "owners update share_links" on public.share_links;
create policy "owners update share_links"
  on public.share_links for update to authenticated
  using (
    exists (
      select 1 from public.viewings v
      where v.id = viewing_id and v.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.viewings v
      where v.id = viewing_id and v.user_id = (select auth.uid())
    )
  );

revoke all on public.share_links from anon;
grant select, insert, update on public.share_links to authenticated;
grant all on public.share_links to service_role;

-- Public resolver: returns ONLY safe columns (not setof viewings).
create or replace function public.resolve_share_link(p_token text)
returns table (
  link_id uuid,
  viewing_id uuid,
  status text,
  capability text,
  expires_at timestamptz,
  password_required boolean,
  address text,
  updated_at timestamptz,
  decision_summary jsonb,
  photo_paths text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := nullif(trim(p_token), '');
begin
  if v_token is null then
    return;
  end if;

  return query
  select
    sl.id,
    sl.viewing_id,
    case
      when sl.status = 'revoked' then 'revoked'
      when sl.expires_at is not null and sl.expires_at <= now() then 'expired'
      when sl.status = 'active' then 'active'
      else sl.status
    end as status,
    sl.capability,
    sl.expires_at,
    (sl.password_hash is not null) as password_required,
    v.address,
    v.updated_at,
    case
      when jsonb_typeof(v.property -> 'decisionSummary') = 'object'
        then v.property -> 'decisionSummary'
      else null
    end as decision_summary,
    coalesce(
      (
        select array_agg(p)
        from jsonb_array_elements_text(
          coalesce(v.property -> 'decisionSummary' -> 'photos', '[]'::jsonb)
        ) as t(p)
        -- placeholder: real path extraction happens in app layer from snapshot
      ),
      '{}'::text[]
    ) as photo_paths
  from public.share_links sl
  join public.viewings v on v.id = sl.viewing_id
  where sl.token = v_token
  limit 1;
end;
$$;

revoke all on function public.resolve_share_link(text) from public;
grant execute on function public.resolve_share_link(text) to anon, authenticated, service_role;

-- Harden legacy RPC: stop returning full viewings rows to anon.
-- After cutover, prefer resolve_share_link only and drop this function.
create or replace function public.get_viewing_by_share_token(p_token text)
returns table (
  address text,
  tags text[],
  pros text[],
  risks text[],
  photo_urls text[],
  property jsonb,
  updated_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    v.address,
    v.tags,
    v.pros,
    v.risks,
    -- Prefer decision-summary photos only; still returns photo_urls for legacy cards.
    -- App layer must project via toPublicSharePayload and omit audio/notes.
    v.photo_urls,
    jsonb_build_object(
      'decisionSummary', v.property -> 'decisionSummary',
      'unitLabel', v.property -> 'unitLabel',
      'priceLabel', v.property -> 'priceLabel',
      'layoutLabel', v.property -> 'layoutLabel',
      'viewingAt', v.property -> 'viewingAt'
    ) as property,
    v.updated_at,
    v.created_at
  from public.viewings v
  where v.share_token is not null
    and v.share_token = nullif(trim(p_token), '')
  limit 1;
$$;

comment on function public.get_viewing_by_share_token(text) is
  'Legacy share resolver — narrowed columns. Prefer resolve_share_link. Still lacks expiry/password/revoke.';
