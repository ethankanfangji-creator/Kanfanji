import { describe, expect, it } from "vitest";
import {
  coerceDecisionStatus,
  isDecisionStatus,
  toggleDecisionStatus,
} from "./decision-status";

describe("decision status", () => {
  it("accepts known statuses only", () => {
    expect(isDecisionStatus("liked")).toBe(true);
    expect(isDecisionStatus("damp")).toBe(false);
    expect(coerceDecisionStatus("shortlist")).toBe("shortlist");
    expect(coerceDecisionStatus("none")).toBeNull();
    expect(coerceDecisionStatus("wet")).toBeNull();
  });

  it("toggles off when selecting the same status", () => {
    expect(toggleDecisionStatus("liked", "liked")).toBeNull();
    expect(toggleDecisionStatus(null, "passed")).toBe("passed");
    expect(toggleDecisionStatus("liked", "passed")).toBe("passed");
  });
});
