import { describe, expect, it } from "vitest";
import { coerceOverallRating } from "./overall-rating";

describe("coerceOverallRating", () => {
  it("accepts 1–5 integers", () => {
    expect(coerceOverallRating(1)).toBe(1);
    expect(coerceOverallRating(5)).toBe(5);
    expect(coerceOverallRating("3")).toBe(3);
  });

  it("rejects out of range and non-numbers", () => {
    expect(coerceOverallRating(0)).toBeNull();
    expect(coerceOverallRating(6)).toBeNull();
    expect(coerceOverallRating(null)).toBeNull();
    expect(coerceOverallRating("x")).toBeNull();
  });

  it("rounds half values to nearest integer within range", () => {
    expect(coerceOverallRating(3.4)).toBe(3);
    expect(coerceOverallRating(3.6)).toBe(4);
  });
});
