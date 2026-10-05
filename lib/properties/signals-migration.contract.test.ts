import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20261005030000_property_signals.sql",
    import.meta.url,
  ),
  "utf8",
);
const themeMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20261005040000_property_signals_theme_counts.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("property_signals migration contract", () => {
  it("creates anonymous count table with service-role-only access", () => {
    expect(migration).toContain("create table if not exists public.property_signals");
    expect(migration).toContain("property_id uuid primary key");
    expect(migration).toContain("liked_count");
    expect(migration).toContain("shortlist_count");
    expect(migration).toContain("passed_count");
    expect(migration).toContain("revisit_count");
    expect(migration).not.toMatch(/\buser_id\b/);
    expect(migration).not.toMatch(/^\s*notes\b/m);
    expect(migration).toContain(
      "revoke all on table public.property_signals from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant all on table public.property_signals to service_role",
    );
  });

  it("adds theme_counts without free-text question storage", () => {
    expect(themeMigration).toContain("theme_counts jsonb");
    expect(themeMigration).toContain("ask_hit_count");
    expect(themeMigration).toContain("last_ask_at");
    expect(themeMigration).not.toMatch(/add column if not exists question/i);
    expect(themeMigration).toContain("No free text");
  });
});
