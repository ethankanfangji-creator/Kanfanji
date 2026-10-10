import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("share_links closed + republish migration", () => {
  const body = readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20261005020000_share_links_closed_republish.sql",
    ),
    "utf8",
  );

  it("adds closed_at and soft-close / republish RPCs", () => {
    expect(body).toContain("closed_at");
    expect(body).toContain("set_share_link_closed");
    expect(body).toContain("republish_share_link");
    // Fan-out republish lives in the recipient-codes migration.
  });

  it("keeps single-link republish RPC for compatibility", () => {
    expect(body).toMatch(/create or replace function public\.republish_share_link/);
    expect(body).toContain("sl.closed_at is null");
  });

  it("allows snapshot updates on active links", () => {
    expect(body).not.toContain("published share snapshot is immutable");
  });
});
