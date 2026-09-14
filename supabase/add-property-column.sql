-- Run once if viewings table already exists without property column.
alter table public.viewings
  add column if not exists property jsonb not null default '{}'::jsonb;
