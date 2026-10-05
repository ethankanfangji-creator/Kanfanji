-- Roll Ask theme aggregates into property_signals (counts only, no question text).

alter table public.property_signals
  add column if not exists theme_counts jsonb not null default '{}'::jsonb;

alter table public.property_signals
  add column if not exists ask_hit_count integer not null default 0;

alter table public.property_signals
  add column if not exists last_ask_at timestamptz;

alter table public.property_signals
  drop constraint if exists property_signals_ask_hit_count_chk;

alter table public.property_signals
  add constraint property_signals_ask_hit_count_chk
  check (ask_hit_count >= 0);

alter table public.property_signals
  drop constraint if exists property_signals_theme_counts_object_chk;

alter table public.property_signals
  add constraint property_signals_theme_counts_object_chk
  check (jsonb_typeof(theme_counts) = 'object');

alter table public.property_signals
  drop constraint if exists property_signals_theme_counts_size_chk;

alter table public.property_signals
  add constraint property_signals_theme_counts_size_chk
  check (pg_column_size(theme_counts) <= 4096);

comment on column public.property_signals.theme_counts is
  'Ask theme hit counts keyed by fixed tags (budget, risk, …). No free text.';
comment on column public.property_signals.ask_hit_count is
  'Number of Ask answers attributed to this property (matched homes).';
