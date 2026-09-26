import { describe, expect, it } from "vitest";
import { sanitizeAnalyticsProps, sanitizeEvent } from "./sanitize";

describe("sanitizeAnalyticsProps", () => {
  it("drops unknown keys and non-enum strings", () => {
    expect(
      sanitizeAnalyticsProps("address_search_started", {
        region: "2143 Clarke St",
        address: "2143 Clarke St",
        lat: 49.2,
        lng: -123.1,
        email: "a@b.co",
        text: "notes",
      }),
    ).toEqual({});
  });

  it("keeps allowlisted enums and finite integers", () => {
    expect(
      sanitizeAnalyticsProps("address_suggestion_selected", {
        source: "google",
        region: "CA",
        rank: 1,
        address: "hidden",
      }),
    ).toEqual({ source: "google", region: "CA", rank: 1 });
  });

  it("rejects a non-integer rank and a count outside 2 or 3", () => {
    expect(
      sanitizeAnalyticsProps("address_suggestion_selected", {
        source: "photon",
        region: "TW",
        rank: 1.5,
      }),
    ).toEqual({ source: "photon", region: "TW" });
    expect(
      sanitizeAnalyticsProps("compare_opened", { count: 4, source: "chat_history" }),
    ).toEqual({ source: "chat_history" });
  });

  it("refuses an event whose required props were stripped", () => {
    expect(
      sanitizeEvent({
        name: "address_confirmed",
        props: { source: "google", region: "2143 Clarke St" as "CA" },
      }),
    ).toBeNull();
  });
});
