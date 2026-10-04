-- Public share-link comments on viewing reports (anonymous visitors).
-- Access only via service_role APIs; anon/authenticated have no direct grants.

create table if not exists public.share_comment_limits (
  key_hash text primary key,
  window_started_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.share_report_comments (
  id uuid primary key default gen_random_uuid(),
  viewing_id uuid not null references public.viewings (id) on delete cascade,
  share_link_id uuid not null references public.share_links (id) on delete cascade,
  author_label text not null default '訪客',
  body text not null,
  client_hash text,
  created_at timestamptz not null default now(),
  constraint share_report_comments_author_len check (
    char_length(author_label) between 1 and 40
  ),
  constraint share_report_comments_body_len check (
    char_length(body) between 1 and 500
  ),
  constraint share_report_comments_client_hash_len check (
    client_hash is null or char_length(client_hash) = 64
  )
);

create index if not exists share_report_comments_viewing_created_idx
  on public.share_report_comments (viewing_id, created_at desc);

create index if not exists share_report_comments_share_link_created_idx
  on public.share_report_comments (share_link_id, created_at desc);

alter table public.share_report_comments enable row level security;
alter table public.share_comment_limits enable row level security;

revoke all on table public.share_report_comments from public, anon, authenticated;
revoke all on table public.share_comment_limits from public, anon, authenticated;
grant all on table public.share_report_comments to service_role;
grant all on table public.share_comment_limits to service_role;

-- Owners may read comments for their viewings (no insert/update/delete via RLS).
drop policy if exists "owners select share report comments" on public.share_report_comments;
create policy "owners select share report comments"
  on public.share_report_comments for select to authenticated
  using (
    exists (
      select 1 from public.viewings v
      where v.id = viewing_id and v.user_id = (select auth.uid())
    )
  );

grant select on table public.share_report_comments to authenticated;

create or replace function public.consume_share_comment_attempt(p_key text)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window constant interval := interval '1 minute';
  v_limit constant integer := 5;
  v_row public.share_comment_limits;
begin
  if p_key is null or length(p_key) <> 64 then
    raise exception 'invalid rate-limit key';
  end if;
  insert into public.share_comment_limits (key_hash, window_started_at, attempts, updated_at)
  values (p_key, v_now, 1, v_now)
  on conflict (key_hash) do update
  set window_started_at = case
        when public.share_comment_limits.window_started_at + v_window <= v_now then v_now
        else public.share_comment_limits.window_started_at
      end,
      attempts = case
        when public.share_comment_limits.window_started_at + v_window <= v_now then 1
        else public.share_comment_limits.attempts + 1
      end,
      updated_at = v_now
  returning * into v_row;
  allowed := v_row.attempts <= v_limit;
  retry_after_seconds := case
    when allowed then 0
    else greatest(
      1,
      ceil(extract(epoch from (v_row.window_started_at + v_window - v_now)))::integer
    )
  end;
  return next;
end;
$$;

revoke all on function public.consume_share_comment_attempt(text) from public;
revoke all on function public.consume_share_comment_attempt(text) from anon, authenticated;
grant execute on function public.consume_share_comment_attempt(text) to service_role;
