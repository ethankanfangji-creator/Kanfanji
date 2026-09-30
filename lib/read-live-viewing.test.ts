import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("read_live_viewing", () => {
  it("lets a logged-in code holder read one session and does not open writes or realtime", () => {
    const sql = readFileSync("supabase/migrations/20260929200000_read_live_viewing.sql", "utf8");
    expect(sql).toContain("security definer");
    expect(sql).toContain("auth.uid() is null");
    expect(sql).toContain("where code = p_code");
    expect(sql).toContain("revoke all on function public.read_live_viewing(text) from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.read_live_viewing(text) to authenticated");
    expect(sql).not.toMatch(/realtime|presence/i);
    expect(sql).not.toContain("for update");
    expect(sql).not.toContain("grant insert");
  });
});
