import { describe, expect, it } from "vitest";
import { buildOpenInMapsUrl, extractConfirmedMapCoords } from "./open-in-maps";

describe("buildOpenInMapsUrl", () => {
  it("builds a Google Maps search URL with coords and optional label", () => {
    const url = buildOpenInMapsUrl(49.278436, -122.8798442, "1167 Victory Drive");
    expect(url.startsWith("https://www.google.com/maps/search/?api=1&query=")).toBe(
      true,
    );
    expect(decodeURIComponent(url)).toContain("49.278436,-122.8798442");
    expect(decodeURIComponent(url)).toContain("Victory");
  });
});

describe("extractConfirmedMapCoords", () => {
  it("prefers sitePin over property coords", () => {
    expect(
      extractConfirmedMapCoords({
        chatState: { sitePin: { lat: 49.28, lng: -122.85, source: "civic" } },
        property: { lat: 1, lng: 2 },
      }),
    ).toEqual({ lat: 49.28, lng: -122.85 });
  });

  it("falls back to property coords", () => {
    expect(
      extractConfirmedMapCoords({
        chatState: {},
        property: { lat: "49.2", lng: "-122.8" },
      }),
    ).toEqual({ lat: 49.2, lng: -122.8 });
  });

  it("returns null without coords", () => {
    expect(extractConfirmedMapCoords({ chatState: {} })).toBeNull();
  });
});
