-- Portfolio Q&A sessions (cross-viewing ask) + allow portfolio AI feedback kind.

alter table public.ai_generation_feedback
  drop constraint if exists ai_generation_feedback_kind_check;

alter table public.ai_generation_feedback
  add constraint ai_generation_feedback_kind_check
  check (kind in ('briefing', 'report', 'portfolio'));

create table if not exists public.portfolio_ask_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Ask',
  scope jsonb not null default '{"mode":"all"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolio_ask_sessions_title_len check (char_length(title) between 1 and 120),
  constraint portfolio_ask_sessions_scope_size check (pg_column_size(scope) <= 8192)
);

create index if not exists portfolio_ask_sessions_user_updated_idx
  on public.portfolio_ask_sessions (user_id, updated_at desc);

create table if not exists public.portfolio_ask_turns (
  id uuid primary key,
  session_id uuid not null references public.portfolio_ask_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  matched_ids text[] not null default '{}',
  citations jsonb not null default '[]'::jsonb,
  suggest_compare boolean not null default false,
  feedback text check (feedback is null or feedback in ('like', 'dislike')),
  feedback_reason text,
  sort_index integer not null default 0,
  created_at timestamptz not null default now(),
  constraint portfolio_ask_turns_content_len check (char_length(content) between 1 and 8000),
  constraint portfolio_ask_turns_reason_len check (
    feedback_reason is null or char_length(feedback_reason) <= 280
  ),
  constraint portfolio_ask_turns_citations_size check (pg_column_size(citations) <= 16384)
);

create index if not exists portfolio_ask_turns_session_sort_idx
  on public.portfolio_ask_turns (session_id, sort_index asc);

alter table public.portfolio_ask_sessions enable row level security;
alter table public.portfolio_ask_turns enable row level security;

revoke all on table public.portfolio_ask_sessions from public, anon, authenticated;
revoke all on table public.portfolio_ask_turns from public, anon, authenticated;

grant select, insert, update, delete on table public.portfolio_ask_sessions to authenticated;
grant select, insert, update, delete on table public.portfolio_ask_turns to authenticated;
grant all on table public.portfolio_ask_sessions to service_role;
grant all on table public.portfolio_ask_turns to service_role;

drop policy if exists "owners manage portfolio ask sessions" on public.portfolio_ask_sessions;
create policy "owners manage portfolio ask sessions"
  on public.portfolio_ask_sessions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "owners manage portfolio ask turns" on public.portfolio_ask_turns;
create policy "owners manage portfolio ask turns"
  on public.portfolio_ask_turns for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
