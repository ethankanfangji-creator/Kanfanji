-- Read-only metadata contract for migrate-sensitive-table-least-privilege.sql.
-- Run after the migration on a staging/branch database. Any mismatch raises
-- an exception; the transaction is explicitly read-only and always rolls back.

begin transaction read only;

do $contract$
declare
  sensitive_tables constant text[] := array[
    'viewings',
    'properties',
    'subscriptions',
    'viewing_members',
    'viewing_invites',
    'viewing_comments',
    'viewing_audit_events'
  ];
  actual_columns text[];
  privilege_name text;
  table_name text;
  role_name text;
begin
  foreach table_name in array sensitive_tables loop
    if not exists (
      select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = table_name
        and c.relrowsecurity
    ) then
      raise exception 'RLS is not enabled on public.%', table_name;
    end if;

    foreach role_name in array array['anon', 'authenticated'] loop
      if has_table_privilege(
        role_name,
        format('public.%I', table_name),
        'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
      ) then
        raise exception 'unexpected table privilege for % on public.%',
          role_name, table_name;
      end if;
    end loop;

    foreach privilege_name in array array[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
    ] loop
      if not has_table_privilege(
        'service_role',
        format('public.%I', table_name),
        privilege_name
      ) then
        raise exception 'service_role is missing % on public.%',
          privilege_name, table_name;
      end if;
    end loop;
  end loop;

  if exists (
    select 1
    from information_schema.table_privileges
    where table_schema = 'public'
      and table_name = any(sensitive_tables)
      and grantee = 'PUBLIC'
  ) then
    raise exception 'PUBLIC retains a sensitive-table privilege';
  end if;

  select array_agg(column_name order by column_name)
  into actual_columns
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'viewings'
    and grantee = 'authenticated'
    and privilege_type = 'SELECT';
  if actual_columns is distinct from array[
    'address',
    'client_updated_at',
    'created_at',
    'id',
    'idempotency_key',
    'is_pro',
    'market',
    'photo_urls',
    'property_id',
    'pros',
    'questions',
    'revision',
    'risks',
    'tags',
    'updated_at',
    'user_id',
    'video_urls'
  ]::text[] then
    raise exception 'authenticated viewing SELECT columns differ: %', actual_columns;
  end if;

  select array_agg(column_name order by column_name)
  into actual_columns
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'viewings'
    and grantee = 'authenticated'
    and privilege_type = 'INSERT';
  if actual_columns is distinct from array[
    'address',
    'audio_urls',
    'client_updated_at',
    'idempotency_key',
    'is_pro',
    'market',
    'notes',
    'photo_urls',
    'property',
    'property_id',
    'pros',
    'questions',
    'revision',
    'risks',
    'tags',
    'updated_at',
    'user_id',
    'video_urls'
  ]::text[] then
    raise exception 'authenticated viewing INSERT columns differ: %', actual_columns;
  end if;

  select array_agg(column_name order by column_name)
  into actual_columns
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'viewings'
    and grantee = 'authenticated'
    and privilege_type = 'UPDATE';
  if actual_columns is distinct from array[
    'address',
    'client_updated_at',
    'market',
    'notes',
    'property',
    'pros',
    'questions',
    'revision',
    'risks',
    'tags',
    'updated_at',
    'user_id'
  ]::text[] then
    raise exception 'authenticated viewing UPDATE columns differ: %', actual_columns;
  end if;

  select array_agg(column_name order by column_name)
  into actual_columns
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'subscriptions'
    and grantee = 'authenticated'
    and privilege_type = 'SELECT';
  if actual_columns is distinct from array['plan', 'status', 'user_id']::text[] then
    raise exception 'authenticated subscription SELECT columns differ: %',
      actual_columns;
  end if;

  if exists (
    select 1
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name in (
        'properties',
        'viewing_members',
        'viewing_invites',
        'viewing_comments',
        'viewing_audit_events'
      )
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ) then
    raise exception 'a collaboration/property table retains client column grants';
  end if;
end
$contract$;

rollback;
