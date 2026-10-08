import { describe, expect, it } from "vitest";
import { buildGoogleStaticMapUrl, parseMapCoverQuery } from "./google-static";

describe("google static map helpers", () => {
  it("builds a Static Maps URL with marker and clamped size", () => {
    const url = buildGoogleStaticMapUrl({
      lat: 49.28,
      lng: -122.85,
      width: 2000,
      height: 10,
      apiKey: "test-key",
    });
    expect(url).toContain("maps.googleapis.com/maps/api/staticmap?");
    expect(url).toContain("size=640x80");
    expect(url).toContain("markers=color%3A0x111111%7C49.28%2C-122.85");
    expect(url).toContain("key=test-key");
  });

  it("parses and rejects cover query params", () => {
    expect(
      parseMapCoverQuery(new URLSearchParams("lat=49.28&lng=-122.85&w=320&h=180")),
    ).toEqual({ lat: 49.28, lng: -122.85, width: 320, height: 180, zoom: 15 });
    expect(parseMapCoverQuery(new URLSearchParams("lat=999&lng=0"))).toBeNull();
    expect(parseMapCoverQuery(new URLSearchParams("lat=1"))).toBeNull();
  });
});
