-- Old active rows have a hash and no ciphertext.
-- Adding the NOT VALID check must succeed, the row must still resolve,
-- and a new active row without ciphertext must be rejected.

begin;

insert into public.viewings (id, user_id, address, chat_state, photo_urls)
select
  '11111111-1111-4111-8111-111111111111',
  id,
  'legacy share fixture',
  '{"v":1}'::jsonb,
  '{}'::text[]
from auth.users
limit 1;

alter table public.share_links drop constraint if exists share_links_active_requires_ciphertext;

insert into public.share_links (
  id,
  viewing_id,
  token,
  token_hash,
  token_ciphertext,
  status,
  expires_at,
  published_snapshot,
  media_manifest
)
select
  '22222222-2222-4222-8222-222222222222',
  v.id,
  null,
  encode(extensions.digest(convert_to('legacy-token', 'utf8'), 'sha256'), 'hex'),
  null,
  'active',
  now() + interval '30 days',
  '{"version":1}'::jsonb,
  '[]'::jsonb
from public.viewings v
where v.id = '11111111-1111-4111-8111-111111111111';

alter table public.share_links
  add constraint share_links_active_requires_ciphertext
  check (status <> 'active' or token_ciphertext is not null) not valid;

select id
from public.share_links
where id = '22222222-2222-4222-8222-222222222222'
  and status = 'active'
  and token_ciphertext is null;

insert into public.viewings (id, user_id, address, photo_urls)
select
  '44444444-4444-4444-8444-444444444444',
  user_id,
  'second fixture',
  '{}'::text[]
from public.viewings
where id = '11111111-1111-4111-8111-111111111111';

do $$
begin
  insert into public.share_links (
    id,
    viewing_id,
    token,
    token_hash,
    token_ciphertext,
    status,
    expires_at,
    published_snapshot,
    media_manifest
  )
  values (
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
    null,
    encode(extensions.digest(convert_to('new-token', 'utf8'), 'sha256'), 'hex'),
    null,
    'active',
    now() + interval '30 days',
    '{"version":1}'::jsonb,
    '[]'::jsonb
  );
  raise exception 'new active row without ciphertext was accepted';
exception
  when check_violation then
    null;
end $$;

select public.resolve_share_publication_by_hash(
  encode(extensions.digest(convert_to('legacy-token', 'utf8'), 'sha256'), 'hex')
) -> 'shareLink' ->> 'id' as resolved_id;

rollback;
