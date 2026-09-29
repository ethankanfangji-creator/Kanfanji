-- Already applied on the dev database (recorded as 20260929044629) and on
-- production (recorded as 20260929044648). Do not apply this file again.
-- It is idempotent so a fresh database can still run it.
-- A fresh baseline only creates the 5-argument overload, which that migration
-- already limits to service_role. The 9-argument overload exists only where
-- the legacy multi-country script was applied, so skip when it is absent.
-- REVOKE/GRANT error if the named function does not exist.

do $$
begin
  if to_regprocedure('public.find_or_create_property(text, double precision, double precision, text, integer, text, text, text, text)') is not null then
    revoke execute on function public.find_or_create_property(text, double precision, double precision, text, integer, text, text, text, text) from public, anon, authenticated;
    grant execute on function public.find_or_create_property(text, double precision, double precision, text, integer, text, text, text, text) to service_role;
  end if;
end;
$$;
