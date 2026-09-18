import { describe, expect, it } from "vitest";
import {
  GENERATE_STAGE_IDS,
  isGenerateStageReached,
} from "./generate-stages";

describe("generate stages", () => {
  it("orders the four Stage 3 progress steps", () => {
    expect(GENERATE_STAGE_IDS).toEqual(["organize", "analyze", "summary", "build"]);
  });

  it("marks earlier stages complete as generation advances", () => {
    expect(isGenerateStageReached("summary", "organize")).toBe(true);
    expect(isGenerateStageReached("summary", "analyze")).toBe(true);
    expect(isGenerateStageReached("summary", "summary")).toBe(true);
    expect(isGenerateStageReached("summary", "build")).toBe(false);
    expect(isGenerateStageReached(null, "organize")).toBe(false);
  });
});
