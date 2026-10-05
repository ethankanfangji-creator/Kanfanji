import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20261005070000_retire_share_password_unlock.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("share password unlock retire migration contract", () => {
  it("clears leftover hashes and drops unlock limiter + unused rotate overloads", () => {
    expect(migration).toContain("set password_hash = null");
    expect(migration).toContain("drop function if exists public.consume_share_unlock_attempt(text)");
    expect(migration).toContain("drop table if exists public.share_unlock_limits");
    expect(migration).toContain("drop function if exists public.rotate_share_link(uuid, uuid, text)");
    expect(migration).toContain(
      "drop function if exists public.rotate_share_link(uuid, uuid, text, text)",
    );
    expect(migration).not.toContain("drop column");
    expect(migration).toMatch(/rotate_chat_share_link/);
  });
});
