import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20261004010000_viewing_report_versions.sql", import.meta.url),
  "utf8",
);
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

describe("viewing_report_versions migration", () => {
  it("creates an owner-readable version table with service-role writes", () => {
    expect(migration).toContain("create table if not exists public.viewing_report_versions");
    expect(migration).toContain("unique (viewing_id, version)");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("owners can read report versions");
    expect(migration).toContain("grant select on table public.viewing_report_versions to authenticated");
    expect(migration).toContain("grant all on table public.viewing_report_versions to service_role");
    expect(migration).not.toContain("grant insert on table public.viewing_report_versions to authenticated");
  });

  it("keeps the same table in schema.sql", () => {
    expect(schema).toContain("create table if not exists public.viewing_report_versions");
    expect(schema).toContain("notes_fingerprint text not null");
  });
});
