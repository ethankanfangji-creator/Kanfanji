import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20261005060000_drop_house_cards_discussion.sql", import.meta.url),
  "utf8",
);

describe("house cards / discussion drop migration contract", () => {
  it("drops live RPC helpers and card/discussion tables", () => {
    expect(migration).toContain("drop function if exists public.read_live_viewing(text)");
    expect(migration).toContain("drop function if exists public.viewing_has_active_session(uuid)");
    expect(migration).toContain("drop function if exists private.ensure_live_viewer(uuid)");
    expect(migration).toContain(
      "drop trigger if exists viewing_card_templates_protect_system_name on public.viewing_card_templates",
    );
    expect(migration).toContain("drop table if exists public.discussion_comments");
    expect(migration).toContain("drop table if exists public.discussion_rooms");
    expect(migration).toContain("drop table if exists public.viewing_sessions");
    expect(migration).toContain("drop table if exists public.viewing_cards");
    expect(migration).toContain("drop table if exists public.viewing_card_templates");
    expect(migration).toContain("alter publication supabase_realtime drop table public.viewing_cards");
  });
});
