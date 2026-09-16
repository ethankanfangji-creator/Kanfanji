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
  -- Frozen explicit public DTO. Never resolve content from viewings.property.
  published_snapshot jsonb not null,
  -- Array of {"id": text, "path": stable storage object path}; no signed URLs.
  media_manifest jsonb not null default '[]'::jsonb
    check (jsonb_typeof(media_manifest) = 'array'),
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

-- Public access is mediated by server routes. Remove legacy SECURITY DEFINER
-- capabilities so no database role can bypass password/snapshot gating.
drop function if exists public.resolve_share_link(text);
drop function if exists public.get_viewing_by_share_token(text);
