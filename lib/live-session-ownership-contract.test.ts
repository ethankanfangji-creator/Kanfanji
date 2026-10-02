import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20261002110000_lock_session_and_discussion_ownership.sql",
  "utf8",
);

describe("live session and discussion ownership", () => {
  it("stops clients from attaching a session to someone else's viewing", () => {
    expect(sql).toContain('create policy "viewing owners insert sessions"');
    expect(sql).toContain('create policy "viewing owners update sessions"');
    expect(sql).toContain("created_by = (select auth.uid())");
    expect(sql).toContain("(select private.viewing_role(viewing_id)) = 'owner'");
    expect(sql).toContain("v_session.created_by is distinct from v_owner");
    expect(sql).not.toContain('create policy "creators insert sessions"');
  });

  it("stops clients from pointing a discussion room at someone else's viewing", () => {
    expect(sql).toContain("from unnest(viewing_ids) as vid");
    expect(sql).toContain("(select private.viewing_role(vid)) is distinct from 'owner'");
    expect(sql).toContain("cardinality(viewing_ids) > 0");
  });
});
