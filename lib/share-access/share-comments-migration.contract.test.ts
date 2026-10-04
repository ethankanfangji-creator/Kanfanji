import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261004040000_share_report_comments.sql", import.meta.url),
  "utf8",
);

describe("share_report_comments migration contract", () => {
  it("creates comments + rate-limit tables with service_role-only writes", () => {
    expect(migration).toContain("create table if not exists public.share_report_comments");
    expect(migration).toContain("create table if not exists public.share_comment_limits");
    expect(migration).toContain("viewing_id uuid not null");
    expect(migration).toContain("share_link_id uuid not null");
    expect(migration).toContain("revoke all on table public.share_report_comments from public, anon, authenticated");
    expect(migration).toContain("grant all on table public.share_report_comments to service_role");
    expect(migration).toContain("owners select share report comments");
    expect(migration).toContain("consume_share_comment_attempt");
    expect(migration).toContain("grant execute on function public.consume_share_comment_attempt(text) to service_role");
  });
});
