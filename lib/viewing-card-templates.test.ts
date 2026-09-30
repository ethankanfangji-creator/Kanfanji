import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SYSTEM_CARD_TEMPLATE_NAMES, oneEmoji, templateName } from "./viewing-card-templates";

describe("system card template seed", () => {
  it("inserts the eleven system cards in order and not as a user's cards", () => {
    const sql = readFileSync(
      "supabase/migrations/20260929190000_system_card_templates.sql",
      "utf8",
    );
    const names = [...sql.matchAll(/\(\d+, '([^']+)',/g)].map((match) => match[1]);
    expect(names).toEqual([...SYSTEM_CARD_TEMPLATE_NAMES]);
    expect(sql).toContain("is_system");
    expect(sql).toContain("select null, seed.name");
    expect(sql).toContain("system viewing card template name cannot change");
    expect(sql).not.toMatch(/Meta/);
  });
});

describe("own card template input", () => {
  it("accepts one emoji and a name", () => {
    expect(oneEmoji("🍳")).toBe("🍳");
    expect(oneEmoji("🍳🚪")).toBeNull();
    expect(oneEmoji("廚房")).toBeNull();
    expect(templateName("  自家廚房  ")).toBe("自家廚房");
    expect(templateName("")).toBeNull();
  });
});
