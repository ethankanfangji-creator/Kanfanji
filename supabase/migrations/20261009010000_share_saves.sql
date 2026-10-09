-- Signed-in users bookmark public share links ("received / saved for me").
-- Access only via service_role APIs after auth check; no direct client grants.

create table if not exists public.share_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  share_link_id uuid not null references public.share_links (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint share_saves_user_link_uidx unique (user_id, share_link_id)
);

create index if not exists share_saves_user_created_idx
  on public.share_saves (user_id, created_at desc);

create index if not exists share_saves_share_link_idx
  on public.share_saves (share_link_id);

alter table public.share_saves enable row level security;

revoke all on table public.share_saves from public, anon, authenticated;
grant all on table public.share_saves to service_role;
