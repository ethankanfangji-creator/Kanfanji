-- Lightweight Ask preference signals (theme tags only; no question body).

create table if not exists public.portfolio_ask_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id text,
  turn_id text,
  themes text[] not null default '{}',
  scope_mode text not null default 'all'
    check (scope_mode in ('all', 'time', 'ids', 'status')),
  home_count integer not null default 0
    check (home_count >= 0 and home_count <= 40),
  matched_count integer not null default 0
    check (matched_count >= 0 and matched_count <= 40),
  has_share_comments boolean not null default false,
  created_at timestamptz not null default now(),
  constraint portfolio_ask_signals_themes_len check (
    cardinality(themes) between 1 and 8
  ),
  constraint portfolio_ask_signals_themes_allowed check (
    themes <@ array[
      'budget',
      'risk',
      'family_preference',
      'pros_cons',
      'compare',
      'layout',
      'noise_light',
      'parking_transit',
      'decision',
      'other'
    ]::text[]
  ),
  constraint portfolio_ask_signals_session_id_len check (
    session_id is null or char_length(session_id) between 1 and 64
  ),
  constraint portfolio_ask_signals_turn_id_len check (
    turn_id is null or char_length(turn_id) between 1 and 64
  )
);

create index if not exists portfolio_ask_signals_user_created_idx
  on public.portfolio_ask_signals (user_id, created_at desc);

alter table public.portfolio_ask_signals enable row level security;

revoke all on table public.portfolio_ask_signals from public, anon, authenticated;
grant select, insert on table public.portfolio_ask_signals to authenticated;
grant all on table public.portfolio_ask_signals to service_role;

drop policy if exists "owners insert portfolio ask signals" on public.portfolio_ask_signals;
create policy "owners insert portfolio ask signals"
  on public.portfolio_ask_signals for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "owners select portfolio ask signals" on public.portfolio_ask_signals;
create policy "owners select portfolio ask signals"
  on public.portfolio_ask_signals for select to authenticated
  using ((select auth.uid()) = user_id);
