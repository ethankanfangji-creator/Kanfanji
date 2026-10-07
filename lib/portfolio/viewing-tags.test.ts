import { describe, expect, it } from "vitest";
import {
  coerceViewingTags,
  collectFrequentViewingTags,
  decisionStatusFromTags,
  effectiveViewingTags,
  toggleViewingTag,
  viewingTagsPatch,
} from "./viewing-tags";

describe("viewing tags", () => {
  it("coerces, trims, dedupes, and caps", () => {
    expect(
      coerceViewingTags(["  Liked ", "liked", "太吵", "", "x".repeat(40)]),
    ).toEqual(["liked", "太吵", "x".repeat(24)]);
  });

  it("falls back to decisionStatus when tags empty", () => {
    expect(effectiveViewingTags({ decisionStatus: "shortlist" })).toEqual([
      "shortlist",
    ]);
    expect(
      effectiveViewingTags({ tags: ["太吵"], decisionStatus: "liked" }),
    ).toEqual(["太吵"]);
  });

  it("keeps suggestion tags mutually exclusive on toggle", () => {
    expect(toggleViewingTag(["liked", "太吵"], "passed")).toEqual([
      "太吵",
      "passed",
    ]);
    expect(toggleViewingTag(["passed", "太吵"], "passed")).toEqual(["太吵"]);
  });

  it("patches decisionStatus from tags for legacy signals", () => {
    expect(viewingTagsPatch(["太吵", "shortlist"])).toEqual({
      tags: ["太吵", "shortlist"],
      decisionStatus: "shortlist",
    });
    expect(decisionStatusFromTags(["太吵"])).toBeNull();
  });

  it("ranks frequent tags and excludes selected ones", () => {
    expect(
      collectFrequentViewingTags(
        [
          { tags: ["太吵", "候補"] },
          { tags: ["太吵"] },
          { decisionStatus: "liked" },
          { tags: ["太吵", "liked"] },
        ],
        { exclude: ["太吵"], limit: 5 },
      ),
    ).toEqual(["liked", "候補"]);
  });
});
