import { describe, expect, it } from "vitest";
import { classifyLookupBody } from "./address-lookup";

describe("classifyLookupBody", () => {
  it("rejects a bare address string after a suggestion-style call", () => {
    const result = classifyLookupBody({ address: "2143 clarke" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("address_requires_free_text");
  });

  it("allows free-text address lookup only when freeText is set", () => {
    expect(classifyLookupBody({ address: "2143 Clarke St, Port Moody, BC", freeText: true })).toEqual({
      ok: true,
      kind: "free_text",
      address: "2143 Clarke St, Port Moody, BC",
    });
  });

  it("routes a selected place id without treating it as text search", () => {
    expect(
      classifyLookupBody({
        placeId: "gplace:ChIJclarke",
        lat: 49.27,
        lng: -122.86,
      }),
    ).toEqual({ ok: true, kind: "place", placeId: "ChIJclarke" });
  });

  it("routes osm id with optional coordinates", () => {
    expect(classifyLookupBody({ osmId: "photon:99", lat: 49.2, lng: -122.9 })).toEqual({
      ok: true,
      kind: "osm",
      osmId: "photon:99",
      lat: 49.2,
      lng: -122.9,
    });
  });
});
