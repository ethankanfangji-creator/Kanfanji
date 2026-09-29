-- Convert the ciphertext check to NOT VALID so older active rows without a
-- ciphertext remain, then install the forward-only guard.
alter table public.share_links
  drop constraint if exists share_links_active_requires_ciphertext;
alter table public.share_links
  add constraint share_links_active_requires_ciphertext
  check (status <> 'active' or token_ciphertext is not null) not valid;

-- Forward-only guard. Token hash and key id cannot change in place.
-- Replacing a link inserts a new row. Revoke still clears ciphertext.

create or replace function public.share_links_guard_vault()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'revoked' then
    new.token_ciphertext := null;
  end if;
  if tg_op = 'UPDATE' and old.token_key_id is distinct from new.token_key_id then
    raise exception 'token_key_id is immutable';
  end if;
  if tg_op = 'UPDATE' and old.token_hash is distinct from new.token_hash then
    raise exception 'token_hash changes only through a new share row';
  end if;
  if tg_op = 'UPDATE'
    and old.status = 'active'
    and new.status = 'active'
    and old.token_ciphertext is distinct from new.token_ciphertext then
    raise exception 'share token ciphertext is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists share_links_guard_vault on public.share_links;
create trigger share_links_guard_vault
  before update on public.share_links
  for each row
  execute function public.share_links_guard_vault();
