-- Subscriptions + viewings.is_pro
alter table public.viewings
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table public.viewings
  add column if not exists is_pro boolean not null default false;

create index if not exists viewings_user_id_idx on public.viewings (user_id);

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text unique,
  status text not null default 'inactive',
  plan text,
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_stripe_customer_id_idx
  on public.subscriptions (stripe_customer_id);

alter table public.subscriptions enable row level security;

drop policy if exists "users can select own subscription" on public.subscriptions;
create policy "users can select own subscription"
  on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
