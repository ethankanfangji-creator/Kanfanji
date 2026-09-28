import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260928040000_ai_quota_tiers.sql", import.meta.url),
  "utf8",
);

describe("ai quota tiers migration", () => {
  it("keeps the new RPC private to service_role", () => {
    expect(migration.toLowerCase()).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog, private");
    expect(migration).toContain("from anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).not.toMatch(/grant execute[^;]*to anon/i);
    expect(migration).not.toMatch(/grant execute[^;]*to authenticated/i);
  });
});
