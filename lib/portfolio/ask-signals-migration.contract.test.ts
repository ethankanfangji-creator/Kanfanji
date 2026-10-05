import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261004050000_portfolio_ask_signals.sql", import.meta.url),
  "utf8",
);

describe("portfolio_ask_signals migration contract", () => {
  it("creates theme-only signals table with owner RLS", () => {
    expect(migration).toContain("create table if not exists public.portfolio_ask_signals");
    expect(migration).toContain("themes text[]");
    expect(migration).not.toContain("question text");
    expect(migration).toContain("owners insert portfolio ask signals");
    expect(migration).toContain("owners select portfolio ask signals");
    expect(migration).toContain("grant select, insert on table public.portfolio_ask_signals to authenticated");
    expect(migration).toContain("family_preference");
  });
});
