import { describe, expect, it } from "vitest";
import {
  AI_DAILY_LIMITS,
  AI_QUOTA_EXCEEDED_CODE,
  limitFor,
  resetAtFromRetryAfter,
  resolveAiTier,
  wouldExceed,
} from "./ai-quota";

describe("resolveAiTier", () => {
  it("maps unauthenticated to guest", () => {
    expect(resolveAiTier({})).toBe("guest");
    expect(resolveAiTier({ userId: null })).toBe("guest");
  });

  it("maps logged-in non-Pro to free", () => {
    expect(resolveAiTier({ userId: "u1", subscriptionStatus: null })).toBe("free");
    expect(resolveAiTier({ userId: "u1", subscriptionStatus: "canceled" })).toBe("free");
    expect(resolveAiTier({ userId: "u1", subscriptionStatus: "past_due" })).toBe("free");
  });

  it("maps active|trialing to pro via isActiveSubscriptionStatus", () => {
    expect(resolveAiTier({ userId: "u1", subscriptionStatus: "active" })).toBe("pro");
    expect(resolveAiTier({ userId: "u1", subscriptionStatus: "trialing" })).toBe("pro");
  });

  it("ignores client isPro claims", () => {
    expect(
      resolveAiTier({
        userId: "u1",
        subscriptionStatus: "canceled",
        clientIsPro: true,
      }),
    ).toBe("free");
    expect(
      resolveAiTier({
        userId: null,
        clientIsPro: true,
      }),
    ).toBe("guest");
  });
});

describe("limitFor / wouldExceed", () => {
  it("exposes documented defaults", () => {
    expect(limitFor("guest")).toBe(AI_DAILY_LIMITS.guest);
    expect(limitFor("free")).toBe(AI_DAILY_LIMITS.free);
    expect(limitFor("pro")).toBe(AI_DAILY_LIMITS.pro);
    expect(limitFor("free")).toBeGreaterThan(limitFor("guest"));
    expect(limitFor("pro")).toBeGreaterThan(limitFor("free"));
  });

  it("wouldExceed at the limit boundary", () => {
    expect(wouldExceed(0, 5)).toBe(false);
    expect(wouldExceed(4, 5)).toBe(false);
    expect(wouldExceed(5, 5)).toBe(true);
    expect(wouldExceed(6, 5)).toBe(true);
  });

  it("documents the exceeded error code used by API JSON", () => {
    expect(AI_QUOTA_EXCEEDED_CODE).toBe("ai_quota_exceeded");
  });

  it("builds resetAt from retry-after", () => {
    const iso = resetAtFromRetryAfter(90, Date.parse("2026-09-23T12:00:00.000Z"));
    expect(iso).toBe("2026-09-23T12:01:30.000Z");
  });
});
