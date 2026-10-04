import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20261004020000_ai_generation_feedback.sql", import.meta.url),
  "utf8",
);
const portfolioMigration = readFileSync(
  new URL("../supabase/migrations/20261004030000_portfolio_ask_sessions.sql", import.meta.url),
  "utf8",
);
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

describe("ai_generation_feedback migration", () => {
  it("creates owner insert/select table with service-role full access", () => {
    expect(migration).toContain("create table if not exists public.ai_generation_feedback");
    expect(migration).toContain("kind in ('briefing', 'report')");
    expect(migration).toContain("rating in ('like', 'dislike')");
    expect(migration).toContain("grant select, insert on table public.ai_generation_feedback to authenticated");
    expect(migration).toContain("grant all on table public.ai_generation_feedback to service_role");
    expect(migration).not.toContain("grant update on table public.ai_generation_feedback to authenticated");
  });

  it("extends kind to portfolio and adds ask session tables", () => {
    expect(portfolioMigration).toContain("kind in ('briefing', 'report', 'portfolio')");
    expect(portfolioMigration).toContain("create table if not exists public.portfolio_ask_sessions");
    expect(portfolioMigration).toContain("create table if not exists public.portfolio_ask_turns");
  });

  it("keeps the same table in schema.sql", () => {
    expect(schema).toContain("create table if not exists public.ai_generation_feedback");
    expect(schema).toContain("ai_generation_feedback_user_kind_created_idx");
  });
});
