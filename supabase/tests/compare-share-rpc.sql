-- Read-only contract: rolls back every row it inserts.
begin;

do $$
declare
  v_user uuid;
  v_usage uuid;
  v_first uuid;
  v_second uuid;
  v_outcome text;
  v_hash text;
  v_expires timestamptz;
  v_created timestamptz;
  v_i integer;
begin
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then
    raise exception 'no auth user available for compare share contract';
  end if;

  insert into public.compare_usage (user_id, compare_key, item_count, source, is_free_slot)
  values (v_user, repeat('ab', 32), 2, 'chat_history', true)
  returning id into v_usage;

  select outcome, share_id, expires_at
    into v_outcome, v_first, v_expires
  from public.create_compare_share(
    v_user, v_usage, repeat('cd', 32), '{"version":2}'::jsonb, 2,
    false, 2, 5, 2592000, 10, 50
  );
  if v_outcome <> 'created' then
    raise exception 'expected created, got %', v_outcome;
  end if;

  select cs.token_hash, cs.created_at into v_hash, v_created
  from public.compare_shares cs
  where cs.id = v_first;
  if v_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'token_hash is not 64 hex';
  end if;
  if abs(extract(epoch from (v_expires - v_created - interval '30 days'))) > 5 then
    raise exception 'expires_at is not 30 days after created_at';
  end if;

  select outcome, share_id into v_outcome, v_second
  from public.create_compare_share(
    v_user, v_usage, repeat('ef', 32), '{"version":2}'::jsonb, 2,
    false, 2, 5, 2592000, 10, 50
  );
  if v_outcome <> 'created' then
    raise exception 'expected second created, got %', v_outcome;
  end if;
  if not exists (
    select 1 from public.compare_shares cs
    where cs.id = v_first and cs.status = 'revoked' and cs.snapshot is null
  ) then
    raise exception 'old share was not revoked with a null snapshot';
  end if;

  for v_i in 3..11 loop
    select outcome into v_outcome
    from public.create_compare_share(
      v_user, v_usage, md5(v_i::text) || md5((v_i + 1)::text), '{"version":2}'::jsonb, 2,
      false, 2, 5, 2592000, 10, 50
    );
  end loop;
  if v_outcome <> 'rate_limited' then
    raise exception 'expected rate_limited, got %', v_outcome;
  end if;
end
$$;

rollback;
