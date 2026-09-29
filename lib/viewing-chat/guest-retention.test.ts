import { describe, expect, it } from "vitest";
import { guestDaysLeft, guestLocalTtlDays, isExpiredGuestThread } from "./guest-retention";

describe("guest retention", () => {
  const now = new Date("2026-09-27T12:00:00.000Z");

  it("keeps a thread updated just under 3 days", () => {
    const updatedAt = new Date(now.getTime() - (2 * 24 + 23) * 60 * 60 * 1000).toISOString();
    expect(isExpiredGuestThread({ updatedAt, ownerUserId: null }, now)).toBe(false);
    expect(guestDaysLeft({ updatedAt }, now)).toBe(1);
  });

  it("deletes a thread updated 3 days and 1 second ago", () => {
    const updatedAt = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000 + 1000)).toISOString();
    expect(isExpiredGuestThread({ updatedAt, ownerUserId: null }, now)).toBe(true);
  });

  it("uses last update, not created time, and skips owned threads", () => {
    const updatedAt = now.toISOString();
    expect(isExpiredGuestThread({ updatedAt, ownerUserId: "user-1" }, now)).toBe(false);
  });

  it("reads a 7 day override", () => {
    process.env.NEXT_PUBLIC_GUEST_LOCAL_TTL_DAYS = "7";
    expect(guestLocalTtlDays()).toBe(7);
    delete process.env.NEXT_PUBLIC_GUEST_LOCAL_TTL_DAYS;
  });
});
