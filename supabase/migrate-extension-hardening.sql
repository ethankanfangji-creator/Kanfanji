-- Move citext out of the exposed public schema.
-- Apply after migrate-viewing-collaboration.sql.

create schema if not exists extensions;
alter extension citext set schema extensions;

grant usage on schema extensions to postgres, anon, authenticated, service_role;
