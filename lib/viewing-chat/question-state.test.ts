import { describe, expect, it } from "vitest";
import { getSystemPrompt } from "@/lib/prompts/get-system-prompt";
import {
  emptyQuestionState,
  filterAskableKeys,
  markAsked,
  stripInternalKeys,
} from "@/lib/viewing-chat/question-state";

describe("getSystemPrompt", () => {
  it("uses Taiwan units, Canada strata, and the no-key rule", () => {
    const tw = getSystemPrompt("TW", "zh-Hant", { address: "2143 Spring", progress: 40, answered_keys: ["water_damage"] });
    expect(tw).toMatch(/2143 Spring/);
    expect(tw).toMatch(/坪數, 公設比, 管理費/);
    expect(tw).toMatch(/NEVER reveal internal keys like roof_material, water_damage/);
    expect(tw).toMatch(/answered_keys: water_damage/);
    expect(getSystemPrompt("CA", "en")).toMatch(/strata fee/);
    expect(getSystemPrompt("US", "en")).toMatch(/property tax/);
  });
});

describe("question state", () => {
  it("asks roof_storage once and hides water_damage in Chinese", () => {
    const once = markAsked(emptyQuestionState(), "roof_storage");
    expect(filterAskableKeys(["roof_storage", "water_damage"], once)).toEqual(["water_damage"]);
    const again = markAsked(once, "roof_storage");
    expect(again.askedCount.roof_storage).toBe(1);
    expect(stripInternalKeys("Check water damage and roof_storage", "zh-Hant")).toBe(
      "Check 水損 and 屋頂收納",
    );
  });
});
