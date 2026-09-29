-- Already applied on the dev database (recorded as 20260929044629) and on
-- production (recorded as 20260929044648). Do not apply this file again.
-- It is idempotent so a fresh database can still run it.

revoke execute on function public.find_or_create_property(text, double precision, double precision, text, integer, text, text, text, text) from public, anon, authenticated;
grant execute on function public.find_or_create_property(text, double precision, double precision, text, integer, text, text, text, text) to service_role;
