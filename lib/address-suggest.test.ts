import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectSuggestRegion,
  extractTwAdminTokens,
  isBritishColumbiaAddress,
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
    expect(results[0]?.label).toBe("臺北市市府路1號");
    expect(results[0]?.title).toBe("臺北市市府路1號");
    expect(results[0]?.secondary).toMatch(/City Hall/);
    expect(results[0]?.lat).toBeCloseTo(25.0375);
    expect(results.some((r) => /福祿1號公園/.test(r.label))).toBe(false);

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    const geocodeUrl = urls.find((u) => u.includes("/geocode/")) ?? "";
    const autocompleteUrl = urls.find((u) => u.includes("place/autocomplete")) ?? "";
    expect(geocodeUrl).toContain("language=zh-TW");
    expect(geocodeUrl).toContain("region=tw");
    expect(autocompleteUrl).toContain("language=zh-TW");
    expect(autocompleteUrl).toContain("region=tw");
    expect(urls.some((u) => u.includes("place/autocomplete"))).toBe(true);
    expect(urls.some((u) => u.includes("/geocode/"))).toBe(true);
    expect(urls.some((u) => u.includes("places.googleapis.com"))).toBe(false);
    expect(urls.some((u) => u.includes("49.28"))).toBe(false);
    // Nominatim must not short-circuit before geocode for TW+key.
    const autoIdx = urls.findIndex((u) => u.includes("place/autocomplete"));
    const geoIdx = urls.findIndex((u) => u.includes("/geocode/"));
    expect(autoIdx).toBeGreaterThanOrEqual(0);
    expect(geoIdx).toBeGreaterThan(autoIdx);
  });

  it("asks Google for zh-CN when the locale is zh-Hans", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("place/autocomplete")) {
        return jsonResponse({
          status: "OK",
          predictions: [
            {
              place_id: "tw-zh",
              description: "台湾台北市信义区市府路1号",
              structured_formatting: {
                main_text: "市府路1号",
                secondary_text: "台湾台北市信义区",
              },
            },
          ],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const results = await suggestAddresses("台北市市府路1號", {
      locale: "zh-Hans",
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("language=zh-CN");
    expect(results[0]?.label).toContain("市府路");
    expect(results[0]?.label).not.toMatch(/City Hall/);
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

describe("one-shot Metro Vancouver suggest", () => {
  function jsonResponse(body: unknown, ok = true) {
    return Promise.resolve({
      ok,
      json: async () => body,
    } as Response);
  }

  it("keeps only BC for 2143 clarke and does not text-geocode or Nominatim", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
    const details: Record<
      string,
      { formattedAddress: string; lat: number; lng: number; province: string; country: string }
    > = {
      il: {
        formattedAddress: "2143 Clarke St, Illinois, USA",
        lat: 40.1,
        lng: -89.1,
        province: "IL",
        country: "United States",
      },
      "ca-us": {
        formattedAddress: "2143 Clarke Ave, California, USA",
        lat: 34.1,
        lng: -118.2,
        province: "CA",
        country: "United States",
      },
      ky: {
        formattedAddress: "2143 Clarke, Kentucky, USA",
        lat: 38.2,
        lng: -85.7,
        province: "KY",
        country: "United States",
      },
      "bc-1": {
        formattedAddress: "2143 Clarke Street, Port Moody, BC, Canada",
        lat: 49.277,
        lng: -122.862,
        province: "BC",
        country: "Canada",
      },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("places:autocomplete")) {
        const body = JSON.parse(String(init?.body)) as {
          includedRegionCodes: string[];
          locationBias: { circle: { center: { latitude: number } } };
        };
        expect(body.includedRegionCodes).toEqual(["ca"]);
        expect(body.locationBias.circle.center.latitude).toBeCloseTo(49.28);
        return jsonResponse({
          suggestions: ["il", "ca-us", "ky", "bc-1"].map((id) => ({
            placePrediction: {
              placeId: id,
              text: { text: details[id]!.formattedAddress },
            },
          })),
        });
      }
      if (url.includes("/v1/places/")) {
        const id = decodeURIComponent(url.split("/places/")[1] ?? "");
        const row = details[id];
        if (!row) throw new Error(`missing details ${id}`);
        return jsonResponse({
          id,
          formattedAddress: row.formattedAddress,
          location: { latitude: row.lat, longitude: row.lng },
          addressComponents: [
            {
              shortText: row.province,
              longText: row.province,
              types: ["administrative_area_level_1"],
            },
            { longText: row.country, shortText: row.country, types: ["country"] },
          ],
        });
      }
      if (url.includes("nominatim") || url.includes("/geocode/")) {
        throw new Error(`label re-search not allowed: ${url}`);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await suggestAddresses("2143 clarke");
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(
      expect.objectContaining({
        id: "gplace:bc-1",
        formatted: "2143 Clarke Street, Port Moody, BC, Canada",
        lat: 49.277,
        lng: -122.862,
        source: "google",
      }),
    );
    expect(results.some((r) => /Illinois|California|Kentucky/i.test(r.label))).toBe(
      false,
    );
  });

  it("does not call upstream when the request is already aborted", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(
      suggestAddresses("2143 clarke", { signal: controller.signal }),
    ).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects US states in the BC filter", () => {
    expect(
      isBritishColumbiaAddress({
        formatted: "2143 Clarke St, Illinois, USA",
        province: "IL",
      }),
    ).toBe(false);
    expect(
      isBritishColumbiaAddress({
        formatted: "2143 Clarke Street, Port Moody, BC, Canada",
        province: "BC",
      }),
    ).toBe(true);
  });
});
