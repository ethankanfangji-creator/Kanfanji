import { describe, expect, it } from "vitest";
import { shouldPromptAddressSwitch } from "./workflow";

describe("address confirm does not spawn viewings per keystroke", () => {
  it("only prompts after a confirmed different address on an existing session", () => {
    const typing = ["1", "12", "123", "123 M", "123 Main"];
    for (const next of typing) {
      expect(
        shouldPromptAddressSwitch({
          localSessionId: null,
          workflowStatus: "draft",
          committedAddress: "",
          nextAddress: next,
        }),
      ).toBe(false);
    }

    expect(
      shouldPromptAddressSwitch({
        localSessionId: "stable-viewing-id",
        workflowStatus: "collecting",
        committedAddress: "123 Main St",
        nextAddress: "999 Oak Ave",
      }),
    ).toBe(true);
  });
});
