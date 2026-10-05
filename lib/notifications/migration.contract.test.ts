import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261005050000_notifications.sql", import.meta.url),
  "utf8",
);

describe("notifications migration contract", () => {
  it("creates inbox + preferences with owner RLS and service_role inserts", () => {
    expect(migration).toContain("create table if not exists public.notifications");
    expect(migration).toContain("create table if not exists public.notification_preferences");
    expect(migration).toContain("notifications_user_type_dedupe_uidx");
    expect(migration).toContain("revoke all on table public.notifications from public, anon, authenticated");
    expect(migration).toContain("grant all on table public.notifications to service_role");
    expect(migration).toContain("grant select, update (read_at) on table public.notifications to authenticated");
    expect(migration).toContain("users select own notifications");
    expect(migration).toContain("lookup_auth_user_id_by_email");
    expect(migration).toContain(
      "grant execute on function public.lookup_auth_user_id_by_email(text) to service_role",
    );
  });
});
