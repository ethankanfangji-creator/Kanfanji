import { describe, expect, it } from "vitest";
import { proWeekWindow } from "./quota-window";

describe("proWeekWindow", () => {
  it("uses a fixed UTC-7 Monday boundary", () => {
    expect(proWeekWindow(new Date("2026-09-28T06:59:59Z")).weekKey).toBe("2026-09-21");
    const monday = proWeekWindow(new Date("2026-09-28T07:00:00Z"));
    expect(monday.weekKey).toBe("2026-09-28");
    expect(monday.resetsAt.toISOString()).toBe("2026-10-05T07:00:00.000Z");
    expect(proWeekWindow(new Date("2026-11-02T07:00:00Z")).weekKey).toBe("2026-11-02");
    expect(proWeekWindow(new Date("2026-12-07T06:59:59Z")).weekKey).toBe("2026-11-30");
    expect(proWeekWindow(new Date("2026-12-07T07:00:00Z")).weekKey).toBe("2026-12-07");
    const almost = new Date("2026-09-28T06:59:00Z");
    const window = proWeekWindow(almost);
    expect(Math.round((window.resetsAt.getTime() - almost.getTime()) / 1000)).toBe(60);
  });
});
