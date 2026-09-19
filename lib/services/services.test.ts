import { describe, expect, it } from "vitest";
import { createMockAddressService } from "@/lib/services/address/types";
import { createMockAiService, resolveAiServiceStatus } from "@/lib/services/ai/types";
import { createMockShareService } from "@/lib/services/share/types";

describe("service mocks (unconfigured honesty)", () => {
  it("reports AI unconfigured without fake success", async () => {
    expect(resolveAiServiceStatus(undefined)).toBe("unconfigured");
    const ai = createMockAiService({ status: "unconfigured" });
    const result = await ai.integrateInput({
      viewingSessionId: "s1",
      address: "A",
      locale: "en",
      market: "CA",
      boundQuestionId: null,
      boundQuestionText: null,
      text: "note",
      transcript: "",
      questions: [],
      imageBase64: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("ai_unavailable");
      expect(result.retryable).toBe(false);
    }
  });

  it("filters address suggestions from mock seed", async () => {
    const address = createMockAddressService([
      {
        id: "1",
        label: "1200 Westwood St, Coquitlam, BC",
        source: "bc_geocoder",
      },
      {
        id: "2",
        label: "88 Robson St, Vancouver, BC",
        source: "bc_geocoder",
      },
    ]);
    expect(await address.suggest("x")).toEqual([]);
    expect(await address.suggest("Westwood")).toHaveLength(1);
  });

  it("blocks share create when unconfigured", async () => {
    const share = createMockShareService("unconfigured");
    const result = await share.createLink({ viewingId: "v1", userId: "u1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("unconfigured");
  });
});
