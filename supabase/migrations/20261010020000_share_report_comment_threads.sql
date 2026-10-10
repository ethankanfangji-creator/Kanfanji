-- Threaded share-report comments: parent_id, author_kind, depth, optional notify email.
-- Notify email is service_role-only (column privilege); never exposed to authenticated clients.

alter table public.share_report_comments
  add column if not exists parent_id uuid references public.share_report_comments (id) on delete cascade,
  add column if not exists author_kind text not null default 'guest',
  add column if not exists depth smallint not null default 0,
  add column if not exists notify_email_ciphertext text;

alter table public.share_report_comments
  drop constraint if exists share_report_comments_author_kind_check;
alter table public.share_report_comments
  add constraint share_report_comments_author_kind_check
  check (author_kind in ('guest', 'owner'));

alter table public.share_report_comments
  drop constraint if exists share_report_comments_depth_check;
alter table public.share_report_comments
  add constraint share_report_comments_depth_check
  check (depth >= 0 and depth <= 8);

comment on column public.share_report_comments.parent_id is
  'Reply parent; null = root. Must share viewing_id + share_link_id with parent.';
comment on column public.share_report_comments.author_kind is
  'guest = public visitor; owner = viewing owner reply.';
comment on column public.share_report_comments.notify_email_ciphertext is
  'Optional AES-GCM sealed guest email for reply notifications; never returned to clients.';

create index if not exists share_report_comments_link_parent_created_idx
  on public.share_report_comments (share_link_id, parent_id, created_at);

create or replace function public.share_report_comments_reply_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_parent public.share_report_comments;
begin
  if new.parent_id is null then
    new.depth := 0;
    return new;
  end if;

  select * into v_parent
  from public.share_report_comments
  where id = new.parent_id;

  if not found then
    raise exception 'SHARE_COMMENT_PARENT_MISSING';
  end if;

  if v_parent.share_link_id is distinct from new.share_link_id
     or v_parent.viewing_id is distinct from new.viewing_id then
    raise exception 'SHARE_COMMENT_PARENT_MISMATCH';
  end if;

  new.depth := v_parent.depth + 1;
  if new.depth > 8 then
    raise exception 'SHARE_COMMENT_DEPTH';
  end if;

  return new;
end;
$$;

drop trigger if exists share_report_comments_reply_guard on public.share_report_comments;
create trigger share_report_comments_reply_guard
  before insert or update of parent_id, share_link_id, viewing_id
  on public.share_report_comments
  for each row
  execute function public.share_report_comments_reply_guard();

revoke all on function public.share_report_comments_reply_guard() from public, anon, authenticated;

-- Narrow authenticated SELECT so ciphertext never leaves via Data API / RLS.
revoke select on table public.share_report_comments from authenticated;
grant select (
  id,
  viewing_id,
  share_link_id,
  author_label,
  body,
  client_hash,
  created_at,
  parent_id,
  author_kind,
  depth
) on table public.share_report_comments to authenticated;
