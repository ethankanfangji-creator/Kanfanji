-- Viewing Chat Thread: store conversation + generated report on viewings.
-- Additive only; existing columns remain for legacy wizard sync.

alter table public.viewings
  add column if not exists messages jsonb not null default '[]'::jsonb,
  add column if not exists report jsonb;

comment on column public.viewings.messages is
  'Chat thread messages for Meta-AI style viewing capture (user/ai turns).';
comment on column public.viewings.report is
  'Generated viewing report snapshot (3 pros / 3 risks / checklist) from messages.';

-- Least-privilege column grants for authenticated owners.
grant select (messages, report) on table public.viewings to authenticated;
grant insert (messages, report) on table public.viewings to authenticated;
grant update (messages, report) on table public.viewings to authenticated;
