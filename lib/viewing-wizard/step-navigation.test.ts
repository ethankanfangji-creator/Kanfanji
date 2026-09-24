import { describe, expect, it } from "vitest";
import { decideStepNavigationRequest } from "./step-navigation";

describe("decideStepNavigationRequest", () => {
  it("noops when target equals current", () => {
    expect(decideStepNavigationRequest({ from: 2, to: 2, openHighPriorityCount: 3 })).toEqual({
      kind: "noop",
    });
  });

  it("asks confirm when leaving field capture back to address", () => {
    expect(decideStepNavigationRequest({ from: 2, to: 1, openHighPriorityCount: 0 })).toEqual({
      kind: "confirm-back-to-address",
    });
    expect(decideStepNavigationRequest({ from: 3, to: 1, openHighPriorityCount: 0 })).toEqual({
      kind: "confirm-back-to-address",
    });
  });

  it("asks confirm when finishing with open high-priority tickets", () => {
    expect(decideStepNavigationRequest({ from: 2, to: 3, openHighPriorityCount: 2 })).toEqual({
      kind: "confirm-high-priority",
    });
  });

  it("proceeds when finishing with no open high-priority tickets", () => {
    expect(decideStepNavigationRequest({ from: 2, to: 3, openHighPriorityCount: 0 })).toEqual({
      kind: "proceed",
      target: 3,
    });
  });

  it("proceeds for forward step 1 → 2", () => {
    expect(decideStepNavigationRequest({ from: 1, to: 2, openHighPriorityCount: 5 })).toEqual({
      kind: "proceed",
      target: 2,
    });
  });
});
