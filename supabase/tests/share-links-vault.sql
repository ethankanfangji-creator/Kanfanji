-- Old active share rows have a token hash and no ciphertext.
-- The ciphertext check is NOT VALID, so adding it must not fail,
-- and the hash resolver must still open that row.

begin;

insert into public.viewings (id, user_id, address, chat_state)
select
  '11111111-1111-4111-8111-111111111111',
  id,
  'legacy share fixture',
  '{"v":1}'::jsonb
from auth.users
limit 1;

insert into public.share_links (
  id,
  viewing_id,
  user_id,
  token,
  token_hash,
  token_ciphertext,
  status,
  expires_at
)
select
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  v.user_id,
  null,
  encode(extensions.digest('legacy-token', 'sha256'), 'hex'),
  null,
  'active',
  now() + interval '30 days'
from public.viewings v
where v.id = '11111111-1111-4111-8111-111111111111';

do $$
begin
  execute 'alter table public.share_links drop constraint if exists share_links_active_requires_ciphertext';
  execute $ddl$
    alter table public.share_links
      add constraint share_links_active_requires_ciphertext
      check (status <> 'active' or token_ciphertext is not null) not valid
  $ddl$;
end $$;

select id
from public.share_links
where token_hash = encode(extensions.digest('legacy-token', 'sha256'), 'hex')
  and status = 'active'
  and token_ciphertext is null;

rollback;
