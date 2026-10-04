-- Per-user AI generation feedback for briefing / report preference memory.

create table if not exists public.ai_generation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  viewing_id uuid references public.viewings (id) on delete set null,
  kind text not null check (kind in ('briefing', 'report')),
  rating text not null check (rating in ('like', 'dislike')),
  reason text,
  artifact_excerpt text,
  notes_fingerprint text,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ai_generation_feedback_reason_len check (reason is null or char_length(reason) <= 280),
  constraint ai_generation_feedback_excerpt_len check (
    artifact_excerpt is null or char_length(artifact_excerpt) <= 200
  )
);

create index if not exists ai_generation_feedback_user_kind_created_idx
  on public.ai_generation_feedback (user_id, kind, created_at desc);

alter table public.ai_generation_feedback enable row level security;

drop policy if exists "users can select own ai feedback" on public.ai_generation_feedback;
create policy "users can select own ai feedback"
  on public.ai_generation_feedback for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users can insert own ai feedback" on public.ai_generation_feedback;
create policy "users can insert own ai feedback"
  on public.ai_generation_feedback for insert to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on table public.ai_generation_feedback from public, anon, authenticated;
grant select, insert on table public.ai_generation_feedback to authenticated;
grant all on table public.ai_generation_feedback to service_role;
