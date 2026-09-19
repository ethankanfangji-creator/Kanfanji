import { describe, expect, it } from "vitest";
import {
  FREE_VIEWING_LIMIT,
  GUEST_LOCAL_VIEWING_LIMIT,
  canCreateCloudViewing,
  canStartLocalViewing,
} from "./free-tier";
import { createMockShareService } from "@/lib/services/share/types";
import { claimGuestViewingData } from "@/lib/auth/claim-guest-data";

describe("quality policy: create viewing + guest second-room + share ACL", () => {
  it("allows starting a brand-new local viewing for guests under the local limit", () => {
    expect(
      canStartLocalViewing({
        authenticated: false,
        localViewingCount: 0,
      }),
    ).toEqual({ allowed: true });
  });

  it("requires login before a guest starts a second local viewing", () => {
    expect(
      canStartLocalViewing({
        authenticated: false,
        localViewingCount: GUEST_LOCAL_VIEWING_LIMIT,
      }),
    ).toEqual({ allowed: false, reason: "login_required" });
  });

  it("does not gate authenticated users on the guest local limit", () => {
    expect(
      canStartLocalViewing({
        authenticated: true,
        localViewingCount: 5,
      }),
    ).toEqual({ allowed: true });
  });

  it("blocks creating a new free cloud viewing at the free-tier limit", () => {
    expect(
      canCreateCloudViewing({
        viewingId: null,
        freeCount: FREE_VIEWING_LIMIT,
        isPro: false,
        authenticated: true,
      }),
    ).toEqual({ allowed: false, reason: "paywall" });
  });

  it("share mock refuses create without configuration (no fake success)", async () => {
    const share = createMockShareService("unconfigured");
    const result = await share.createLink({ viewingId: "v1", userId: "u1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unconfigured");
      expect(result.retryable).toBe(false);
    }
  });

  it("share mock refuses unauthorized even when marked ready", async () => {
    const share = createMockShareService("ready");
    const result = await share.createLink({ viewingId: "v1", userId: "u1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("unauthorized");
  });

  it("claimGuestViewingData rejects empty user id (login import guard)", async () => {
    await expect(claimGuestViewingData("")).rejects.toThrow(/userId/i);
  });
});
