-- Phase 2: force new viewings through the server gate (POST /api/viewings).
-- Dropping the INSERT policy is enough: authenticated role cannot insert under RLS.
-- Updates/deletes remain client-side under existing policies.
-- Guests never inserted cloud rows before (login required); guest UX unchanged.

drop policy if exists "users can insert own viewings" on public.viewings;
