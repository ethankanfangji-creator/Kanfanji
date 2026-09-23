import { describe, expect, it } from "vitest";
import {
  deriveWorkflowStatus,
  normalizeWorkflowStatus,
  shouldPromptAddressSwitch,
} from "./workflow";

describe("viewing workflow lifecycle", () => {
  it("normalizes unknown values to draft", () => {
    expect(normalizeWorkflowStatus(undefined)).toBe("draft");
    expect(normalizeWorkflowStatus("collecting")).toBe("collecting");
  });

  it("does not prompt while typing the same or empty address without a session", () => {
    expect(
      shouldPromptAddressSwitch({
        localSessionId: null,
        workflowStatus: "draft",
        committedAddress: "",
        nextAddress: "123 Main",
      }),
    ).toBe(false);

    expect(
      shouldPromptAddressSwitch({
        localSessionId: "sess-1",
        workflowStatus: "collecting",
        committedAddress: "123 Main St",
        nextAddress: "123 Main St",
      }),
    ).toBe(false);
  });

  it("prompts when confirming a different address on an active viewing", () => {
    expect(
      shouldPromptAddressSwitch({
        localSessionId: "sess-1",
        workflowStatus: "collecting",
        committedAddress: "123 Main St",
        nextAddress: "456 Oak Ave",
      }),
    ).toBe(true);

    expect(
      shouldPromptAddressSwitch({
        localSessionId: "sess-1",
        workflowStatus: "abandoned",
        committedAddress: "123 Main St",
        nextAddress: "456 Oak Ave",
      }),
    ).toBe(false);
  });

  it("derives collecting and ready states from field content", () => {
    expect(
      deriveWorkflowStatus({
        current: "draft",
        hasFieldContent: true,
        canGenerate: false,
      }),
    ).toBe("collecting");

    expect(
      deriveWorkflowStatus({
        current: "collecting",
        hasFieldContent: true,
        canGenerate: true,
      }),
    ).toBe("ready_to_generate");
  });
});
