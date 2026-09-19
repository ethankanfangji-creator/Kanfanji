-- Additive sync idempotency/CAS support. Apply only through the normal release process.

alter table public.viewings
  add column if not exists idempotency_key text;

alter table public.viewings
  add column if not exists revision integer not null default 1;

alter table public.viewings
  drop constraint if exists viewings_revision_positive_check;
alter table public.viewings
  add constraint viewings_revision_positive_check check (revision > 0);

create unique index if not exists viewings_owner_idempotency_uidx
  on public.viewings (user_id, idempotency_key);
