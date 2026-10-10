import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20261010010000_share_links_recipient_codes.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("share_links recipient codes migration contract", () => {
  it("adds recipient_label and allows multiple active links per viewing", () => {
    expect(migration).toContain("add column if not exists recipient_label text");
    expect(migration).toContain("drop index if exists public.share_links_one_active_per_viewing_uidx");
    expect(migration).toContain("share_links_one_general_active_per_viewing_uidx");
    expect(migration).toContain("share_links_recipient_label_active_uidx");
    expect(migration).toContain("recipient_label");
    expect(migration).toContain("rotate_chat_share_link");
    expect(migration).toContain("v_label");
    expect(migration).toContain("republish_viewing_share_links");
    expect(migration).toContain(
      "grant execute on function public.republish_viewing_share_links(uuid, uuid, jsonb, jsonb)",
    );
  });
});
