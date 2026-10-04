import { describe, expect, it } from "vitest";
import {
  briefingDisplaySources,
  briefingDisplaySummary,
  briefingIsCurrent,
  briefingMatchesAddress,
  briefingMatchesListingUrl,
  coerceViewingBriefing,
  dedupeBriefingSources,
  emptyBriefing,
  isViewingBriefing,
  normalizeBriefingFeedback,
  notesFingerprint,
  summaryFromPoints,
  userNotesOnly,
} from "./briefing";
import { createAiMessage, createUserMessage } from "./types";

describe("viewing briefing helpers", () => {
  it("rejects the old smell/look/ask shape", () => {
    expect(
      isViewingBriefing({
        address: "A Street",
        smell: ["x"],
        look: ["y"],
        ask: ["z"],
        generatedAt: new Date().toISOString(),
      }),
    ).toBe(false);
  });

  it("treats briefing as stale when the address changes", () => {
    const briefing = emptyBriefing("A Street");
    expect(briefingMatchesAddress(briefing, "A Street")).toBe(true);
    expect(briefingMatchesAddress(briefing, "B Street")).toBe(false);
  });

  it("treats briefing as stale when listingUrl changes", () => {
    const withListing = emptyBriefing("A Street", [], "https://realtor.ca/a");
    expect(briefingMatchesListingUrl(withListing, "https://realtor.ca/a")).toBe(true);
    expect(briefingMatchesListingUrl(withListing, "https://realtor.ca/b")).toBe(false);
    expect(briefingIsCurrent(withListing, "A Street", "https://realtor.ca/a")).toBe(true);
    expect(briefingIsCurrent(withListing, "A Street", null)).toBe(false);
  });

  it("falls back from legacy points-only cache to a summary paragraph", () => {
    const legacy = {
      address: "2143 Spring St",
      points: [
        { text: "掛牌 3 房 2 浴。", source: "realtor.ca" },
        { text: "Moody Centre 步行約 16 分。", source: "Google Places" },
      ],
      sourcesQueried: ["geocoder"],
      generatedAt: new Date().toISOString(),
    };
    expect(isViewingBriefing(legacy)).toBe(true);
    const coerced = coerceViewingBriefing(legacy);
    expect(coerced?.summary).toBe("掛牌 3 房 2 浴。 Moody Centre 步行約 16 分。");
    expect(coerced?.sources).toEqual(["realtor.ca", "Google Places"]);
    expect(briefingDisplaySummary(coerced!)).toContain("3 房");
    expect(briefingDisplaySources(coerced!)).toEqual(["realtor.ca", "Google Places"]);
  });

  it("dedupes sources case-insensitively", () => {
    expect(dedupeBriefingSources(["realtor.ca", "Realtor.ca", "Google Places"])).toEqual([
      "realtor.ca",
      "Google Places",
    ]);
  });

  it("coerces like/dislike feedback and drops invalid values", () => {
    expect(normalizeBriefingFeedback("like")).toBe("like");
    expect(normalizeBriefingFeedback("meh")).toBeNull();
    const liked = coerceViewingBriefing({
      address: "A Street",
      summary: "一段簡介。",
      points: [],
      sources: [],
      sourcesQueried: [],
      generatedAt: "2026-10-03T00:00:00.000Z",
      feedback: "like",
      feedbackAt: "2026-10-03T01:00:00.000Z",
    });
    expect(liked?.feedback).toBe("like");
    expect(liked?.feedbackAt).toBe("2026-10-03T01:00:00.000Z");
    expect(
      isViewingBriefing({
        address: "A Street",
        summary: "x",
        points: [],
        generatedAt: "2026-10-03T00:00:00.000Z",
        feedback: "love",
      }),
    ).toBe(false);
    const withoutAt = coerceViewingBriefing({
      address: "A Street",
      summary: "一段簡介。",
      points: [],
      sources: [],
      generatedAt: "2026-10-03T00:00:00.000Z",
      feedback: "dislike",
    });
    expect(withoutAt?.feedback).toBe("dislike");
    expect(withoutAt?.feedbackAt).toBeNull();
  });

  it("joins points into prose", () => {
    expect(
      summaryFromPoints([
        { text: " 一。 ", source: "a" },
        { text: "二。", source: "b" },
      ]),
    ).toBe("一。 二。");
  });

  it("fingerprints only user notes and ignores AI bubbles", () => {
    const quiet = createUserMessage({ type: "text", text: "不吵" });
    const ai = createAiMessage({ type: "follow_up", text: "收到" });
    const a = notesFingerprint([quiet, ai]);
    const b = notesFingerprint([quiet]);
    expect(a).toBe(b);
    const louder = createUserMessage({ type: "text", text: "吵" });
    expect(notesFingerprint([louder])).not.toBe(a);
    expect(userNotesOnly([quiet, ai])).toEqual([quiet]);
  });
});
