import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260928060000_fix_create_compare_share_ambiguity.sql", import.meta.url),
  "utf8",
);

describe("create_compare_share ambiguity fix", () => {
  it("qualifies expires_at and status comparisons and keeps execute private", () => {
    const body = migration.slice(migration.indexOf("as $$"));
    expect(body).not.toMatch(/(?<![\w.])expires_at\s*>/);
    expect(body).not.toMatch(/(?<![\w.])status\s*=/);
    expect(body).toContain("cs.expires_at");
    expect(body).toContain("cs.status");
    expect(migration).toContain("from public;");
    expect(migration).toContain("from anon, authenticated;");
    expect(migration).toContain("to service_role");
    expect(migration).not.toMatch(/grant execute[^;]*to anon/i);
    expect(migration).not.toMatch(/grant execute[^;]*to authenticated/i);
    expect(migration.toLowerCase()).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog, public");
  });
});
