import { describe, expect, it } from "vitest";
import {
  clampArtifactExcerpt,
  clampFeedbackReason,
  formatPreferenceBlock,
} from "./ai-preferences";

describe("formatPreferenceBlock", () => {
  it("returns empty when there are no events", () => {
    expect(formatPreferenceBlock([], "briefing")).toBe("");
  });

  it("includes written dislike reasons (B)", () => {
    const block = formatPreferenceBlock(
      [
        {
          kind: "report",
          rating: "dislike",
          reason: "太條列",
          artifactExcerpt: "採光不錯但噪音未提",
        },
      ],
      "report",
    );
    expect(block).toContain("USER_PREFERENCES");
    expect(block).toContain("reason: 太條列");
    expect(block).toContain("採光不錯但噪音未提");
  });

  it("falls back to thumbs-only lines when reason is missing (A)", () => {
    const block = formatPreferenceBlock(
      [
        { kind: "briefing", rating: "like", artifactExcerpt: "近公園" },
        { kind: "briefing", rating: "dislike" },
      ],
      "briefing",
    );
    expect(block).toContain("Liked prior address briefing");
    expect(block).toContain("no written reason");
    expect(block).toContain("Disliked prior address briefing");
  });

  it("ignores events for the other kind", () => {
    expect(
      formatPreferenceBlock([{ kind: "report", rating: "like" }], "briefing"),
    ).toBe("");
  });
});

describe("clamp helpers", () => {
  it("trims and caps reason / excerpt", () => {
    expect(clampFeedbackReason("  hi  ")).toBe("hi");
    expect(clampFeedbackReason("")).toBeNull();
    expect(clampArtifactExcerpt("a".repeat(250))?.length).toBe(200);
  });
});
