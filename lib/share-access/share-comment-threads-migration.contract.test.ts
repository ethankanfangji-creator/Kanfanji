import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20261010020000_share_report_comment_threads.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("share_report_comment threads migration contract", () => {
  it("adds threading columns, reply guard, and hides notify email from authenticated", () => {
    expect(migration).toContain("add column if not exists parent_id");
    expect(migration).toContain("add column if not exists author_kind");
    expect(migration).toContain("add column if not exists depth");
    expect(migration).toContain("add column if not exists notify_email_ciphertext");
    expect(migration).toContain("share_report_comments_reply_guard");
    expect(migration).toContain("SHARE_COMMENT_PARENT_MISMATCH");
    expect(migration).toContain("SHARE_COMMENT_DEPTH");
    expect(migration).toContain("revoke select on table public.share_report_comments from authenticated");
    expect(migration).toContain("notify_email_ciphertext");
    expect(migration).not.toMatch(
      /grant select \(\s*[^)]*notify_email_ciphertext/i,
    );
  });
});
