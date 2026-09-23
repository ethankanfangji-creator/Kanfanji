import { describe, expect, it } from "vitest";
import {
  FREE_VIEWING_LIMIT,
  GUEST_LOCAL_VIEWING_LIMIT,
  canCreateCloudViewing,
  canStartLocalViewing,
} from "./free-tier";

describe("free-tier viewing gate", () => {
  it("allows editing an existing cloud viewing even at the free limit", () => {
    expect(
      canCreateCloudViewing({
        viewingId: "v1",
        freeCount: FREE_VIEWING_LIMIT,
        isPro: false,
        authenticated: true,
      }),
    ).toEqual({ allowed: true });
  });

  it("requires login for a new cloud viewing", () => {
    expect(
      canCreateCloudViewing({
        viewingId: null,
        freeCount: 0,
        isPro: false,
        authenticated: false,
      }),
    ).toEqual({ allowed: false, reason: "login_required" });
  });

  it("blocks free users at the limit and allows Pro", () => {
    expect(
      canCreateCloudViewing({
        viewingId: null,
        freeCount: FREE_VIEWING_LIMIT,
        isPro: false,
        authenticated: true,
      }),
    ).toEqual({ allowed: false, reason: "paywall" });
    expect(
      canCreateCloudViewing({
        viewingId: null,
        freeCount: FREE_VIEWING_LIMIT,
        isPro: true,
        authenticated: true,
      }),
    ).toEqual({ allowed: true });
  });

  it("requires login for a guest second local room", () => {
    expect(
      canStartLocalViewing({
        authenticated: false,
        localViewingCount: GUEST_LOCAL_VIEWING_LIMIT,
      }),
    ).toEqual({ allowed: false, reason: "login_required" });
  });
});
