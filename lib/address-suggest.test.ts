import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectSuggestRegion,
  extractTwAdminTokens,
  isReasonableGoogleAutocomplete,
  nominatimAdminCompatible,
  nominatimLooksLikeNonAddress,
  normalizeTwAdminText,
  suggestAddresses,
  twAdminDistrictMismatch,
  type AddressSuggestion,
} from "./address-suggest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.GOOGLE_PLACES_API_KEY;
});

describe("suggestAddresses", () => {
  it("returns empty for short queries without calling upstream", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(suggestAddresses("ab")).resolves.toEqual([]);
    await expect(suggestAddresses("  ")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("detectSuggestRegion", () => {
  it("detects US street + ZIP with comma after state", () => {
    expect(detectSuggestRegion("2436 S Leah St, Visalia, CA, 93292")).toBe("US");
    expect(detectSuggestRegion("2436 S Leah St, Visalia, CA 93292")).toBe("US");
  });

  it("detects BC / Canada cues", () => {
    expect(detectSuggestRegion("123 Main St, Burnaby, BC")).toBe("CA");
  });

  it("detects Taiwan cues", () => {
    expect(detectSuggestRegion("台北市信義路五段7號")).toBe("TW");
    expect(detectSuggestRegion("台北市市府路1號")).toBe("TW");
  });
});

describe("TW admin helpers", () => {
  it("normalizes 台 to 臺", () => {
    expect(normalizeTwAdminText("台北市信義區")).toBe("臺北市信義區");
  });

  it("extracts city and district tokens", () => {
    expect(extractTwAdminTokens("台北市市府路1號")).toEqual(["臺北市"]);
    expect(extractTwAdminTokens("台北市信義區市府路1號")).toEqual([
      "臺北市",
      "信義區",
    ]);
  });

  it("detects Taipei vs New Taipei mismatch", () => {
    expect(
      twAdminDistrictMismatch("台北市市府路1號", "新北市新莊區福祿1號公園"),
    ).toBe(true);
    expect(
      twAdminDistrictMismatch("台北市市府路1號", "臺北市信義區市府路1號"),
    ).toBe(false);
  });
});

describe("Nominatim quality filters", () => {
  it("rejects parks and leisure POIs", () => {
    expect(
      nominatimLooksLikeNonAddress({
        class: "leisure",
        type: "park",
        display_name: "福祿1號公園, 新莊區, 新北市, 台灣",
      }),
    ).toBe(true);
    expect(
      nominatimLooksLikeNonAddress({
        display_name: "市府路1號, 信義區, 台北市, 台灣",
        class: "place",
        type: "house",
      }),
    ).toBe(false);
  });

  it("rejects admin-incompatible Nominatim labels", () => {
    expect(
      nominatimAdminCompatible(
        "台北市市府路1號",
        "福祿1號公園, 新莊區, 新北市, 台灣",
      ),
    ).toBe(false);
    expect(
      nominatimAdminCompatible(
        "台北市市府路1號",
        "市府路1號, 信義區, 臺北市, 台灣",
      ),
    ).toBe(true);
  });
});

describe("isReasonableGoogleAutocomplete", () => {
  it("requires Taipei admin overlap for TW queries", () => {
    const bad: AddressSuggestion[] = [
      {
        id: "1",
        label: "新北市新莊區福祿街",
        source: "google",
      },
    ];
    const good: AddressSuggestion[] = [
      {
        id: "2",
        label: "市府路1號, 信義區, 台北市",
        source: "google",
      },
    ];
    expect(
      isReasonableGoogleAutocomplete("台北市市府路1號", bad, "TW"),
    ).toBe(false);
    expect(
      isReasonableGoogleAutocomplete("台北市市府路1號", good, "TW"),
    ).toBe(true);
    expect(isReasonableGoogleAutocomplete("台北市市府路1號", [], "TW")).toBe(
      false,
    );
  });
});

describe("TW suggest ranking with mocked upstream", () => {
  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
  });

  function jsonResponse(body: unknown, ok = true) {
    return Promise.resolve({
      ok,
      json: async () => body,
    } as Response);
  }

  it("prefers Google Geocode over park-only Nominatim when Autocomplete is empty", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("place/autocomplete")) {
        return jsonResponse({ status: "ZERO_RESULTS", predictions: [] });
      }
      if (url.includes("maps.googleapis.com/maps/api/geocode")) {
        return jsonResponse({
          status: "OK",
          results: [
            {
              place_id: "city-hall",
              formatted_address: "No. 1, City Hall Rd, Xinyi District, Taipei City, Taiwan",
              geometry: { location: { lat: 25.0375, lng: 121.5645 } },
              address_components: [
                { long_name: "1", types: ["street_number"] },
                { long_name: "City Hall Road", types: ["route"] },
                { long_name: "Xinyi District", types: ["sublocality"] },
                {
                  long_name: "Taipei City",
                  short_name: "TPE",
                  types: ["administrative_area_level_1"],
                },
                { long_name: "Taiwan", types: ["country"] },
              ],
            },
          ],
        });
      }
      if (url.includes("nominatim.openstreetmap.org")) {
        return jsonResponse([
          {
            place_id: 99,
            class: "leisure",
            type: "park",
            display_name: "福祿1號公園, 新莊區, 新北市, 台灣",
            lat: "25.03",
            lon: "121.42",
          },
        ]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await suggestAddresses("台北市市府路1號", { limit: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.source).toBe("google");
    expect(results[0]?.label).toMatch(/City Hall|市府/i);
    expect(results.some((r) => /福祿1號公園/.test(r.label))).toBe(false);

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("place/autocomplete"))).toBe(true);
    expect(urls.some((u) => u.includes("/geocode/"))).toBe(true);
    // Nominatim must not short-circuit before geocode for TW+key.
    const autoIdx = urls.findIndex((u) => u.includes("place/autocomplete"));
    const geoIdx = urls.findIndex((u) => u.includes("/geocode/"));
    expect(autoIdx).toBeGreaterThanOrEqual(0);
    expect(geoIdx).toBeGreaterThan(autoIdx);
  });

  it("does not call Google when only GOOGLE_PLACES_API_KEY is set", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    process.env.GOOGLE_PLACES_API_KEY = "places-only";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("nominatim.openstreetmap.org")) {
        return jsonResponse([
          {
            place_id: 1,
            class: "place",
            type: "house",
            display_name: "市府路1號, 信義區, 臺北市, 台灣",
            lat: "25.03",
            lon: "121.56",
          },
        ]);
      }
      throw new Error(`unexpected google call: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await suggestAddresses("台北市市府路1號");
    expect(results[0]?.source).toBe("nominatim");
    expect(fetchMock.mock.calls.every((c) => !String(c[0]).includes("googleapis"))).toBe(
      true,
    );
  });

  it("filters park Nominatim rows when falling back without Google key", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("nominatim.openstreetmap.org")) {
        return jsonResponse([
          {
            place_id: 99,
            class: "leisure",
            type: "park",
            display_name: "福祿1號公園, 新莊區, 新北市, 台灣",
            lat: "25.03",
            lon: "121.42",
          },
          {
            place_id: 2,
            class: "place",
            type: "house",
            display_name: "市府路1號, 信義區, 臺北市, 台灣",
            lat: "25.037",
            lon: "121.564",
          },
        ]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await suggestAddresses("台北市市府路1號");
    expect(results).toHaveLength(1);
    expect(results[0]?.label).toContain("市府路");
    expect(results[0]?.label).not.toContain("公園");
  });
});

describe("US/OTHER suggest ranking with mocked upstream", () => {
  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
  });

  function jsonResponse(body: unknown, ok = true) {
    return Promise.resolve({
      ok,
      json: async () => body,
    } as Response);
  }

  it("US: prefers Geocode over park Nominatim when Autocomplete is empty", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("place/autocomplete")) {
        return jsonResponse({ status: "ZERO_RESULTS", predictions: [] });
      }
      if (url.includes("/geocode/")) {
        return jsonResponse({
          status: "OK",
          results: [
            {
              place_id: "us-house",
              formatted_address: "1600 Amphitheatre Parkway, Mountain View, CA 94043, USA",
              geometry: { location: { lat: 37.42, lng: -122.08 } },
              address_components: [
                { long_name: "1600", types: ["street_number"] },
                { long_name: "Amphitheatre Parkway", types: ["route"] },
                { long_name: "Mountain View", types: ["locality"] },
                {
                  long_name: "California",
                  short_name: "CA",
                  types: ["administrative_area_level_1"],
                },
                { long_name: "United States", types: ["country"] },
              ],
            },
          ],
        });
      }
      if (url.includes("nominatim.openstreetmap.org")) {
        return jsonResponse([
          {
            place_id: 77,
            class: "leisure",
            type: "park",
            display_name: "Amphitheatre Park, Somewhere, USA",
            lat: "37.4",
            lon: "-122.0",
          },
        ]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await suggestAddresses("1600 Amphitheatre Parkway, Mountain View, CA 94043");
    expect(results[0]?.source).toBe("google");
    expect(results[0]?.label).toMatch(/Amphitheatre Parkway/i);
    expect(results[0]?.label).not.toMatch(/Amphitheatre Park,/);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    const autoIdx = urls.findIndex((u) => u.includes("place/autocomplete"));
    const geoIdx = urls.findIndex((u) => u.includes("/geocode/"));
    expect(geoIdx).toBeGreaterThan(autoIdx);
    expect(urls.some((u) => u.includes("nominatim"))).toBe(false);
  });

  it("OTHER: same Geocode-before-Nominatim order when key is set", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("place/autocomplete")) {
        return jsonResponse({ status: "ZERO_RESULTS", predictions: [] });
      }
      if (url.includes("/geocode/")) {
        return jsonResponse({
          status: "OK",
          results: [
            {
              place_id: "th-addr",
              formatted_address: "1 Siam Square, Pathum Wan, Bangkok, Thailand",
              geometry: { location: { lat: 13.74, lng: 100.53 } },
              address_components: [
                { long_name: "1", types: ["street_number"] },
                { long_name: "Siam Square", types: ["route"] },
                { long_name: "Bangkok", types: ["locality"] },
                { long_name: "Thailand", types: ["country"] },
              ],
            },
          ],
        });
      }
      if (url.includes("nominatim.openstreetmap.org")) {
        return jsonResponse([
          {
            place_id: 55,
            class: "leisure",
            type: "park",
            display_name: "Siam Park, Bangkok, Thailand",
            lat: "13.7",
            lon: "100.5",
          },
        ]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    // No TW/US/CA cues → OTHER
    const results = await suggestAddresses("1 Siam Square Pathum Wan Bangkok");
    expect(detectSuggestRegion("1 Siam Square Pathum Wan Bangkok")).toBe("OTHER");
    expect(results[0]?.label).toMatch(/Siam Square/i);
    expect(results[0]?.label).not.toMatch(/Siam Park/);
  });
});
