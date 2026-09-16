import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrate-billing-audit-authorization.sql", import.meta.url),
  "utf8",
);

describe("collaboration atomic mutation contract", () => {
  it("keeps mutations and audit insertion inside one server-only function", () => {
    expect(migration).toContain(
      "create or replace function public.mutate_viewing_with_audit",
    );
    expect(migration).toContain(
      "insert into public.viewing_audit_events",
    );
    expect(migration).toContain(
      "revoke all on function public.mutate_viewing_with_audit",
    );
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain(
      "grant execute on function public.mutate_viewing_with_audit",
    );
    expect(migration).toContain("to service_role");
  });

  it("covers every security-sensitive collaboration mutation", () => {
    for (const operation of [
      "invite.create",
      "invite.accept",
      "member.role_change",
      "member.revoke",
      "invite.revoke",
      "comment.create",
      "viewing.update",
      "media.append",
    ]) {
      expect(migration).toContain(`p_operation = '${operation}'`);
    }
    expect(migration).toContain("set search_path = pg_catalog, public");
  });
});
