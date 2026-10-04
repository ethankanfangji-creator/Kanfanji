import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectSuggestRegion,
  extractTwAdminTokens,
  isBritishColumbiaAddress,
  isReasonableGoogleAutocomplete,
  nominatimAdminCompatible,
  nominatimLooksLikeNonAddress,
  normalizeTwAdminText,
  queryNamesPlace,
  rankCanadianSuggestions,
  regionFromIpCountry,
  resolveSuggestRegion,
  splitAddressQuery,
  suggestAddresses,
  twAdminDistrictMismatch,
  withUnitLabel,
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

describe("splitAddressQuery / withUnitLabel", () => {
  it("splits Unit prefix from the street query", () => {
    expect(splitAddressQuery("Unit 5, 2143 Spring St, Port Moody")).toEqual({
      unit: "Unit 5",
      streetQuery: "2143 Spring St, Port Moody",
      houseNumber: "2143",
    });
  });

  it("splits dashed unit-house forms", () => {
    expect(splitAddressQuery("#1202-2143 Spring St")).toMatchObject({
      unit: "1202",
      streetQuery: "2143 Spring St",
      houseNumber: "2143",
    });
  });

  it("leaves plain civic addresses alone", () => {
    expect(splitAddressQuery("2143 Spring Street, Port Moody")).toEqual({
      unit: null,
      streetQuery: "2143 Spring Street, Port Moody",
      houseNumber: "2143",
    });
  });

  it("prefixes confirmed labels with Unit", () => {
    expect(withUnitLabel("2143 Spring St, Port Moody, BC", "5")).toBe(
      "Unit 5, 2143 Spring St, Port Moody, BC",
    );
    expect(withUnitLabel("2143 Spring St, Port Moody, BC", "Unit 5")).toBe(
      "Unit 5, 2143 Spring St, Port Moody, BC",
    );
  });
});

describe("queryNamesPlace", () => {
  it("does not treat street names that reuse province/city words as places", () => {
    expect(queryNamesPlace("7428 Alberta Street")).toBeNull();
    expect(queryNamesPlace("206 - 7428 Alberta Street")).toBeNull();
    expect(queryNamesPlace("100 Victoria Drive")).toBeNull();
    expect(queryNamesPlace("12 Richmond St")).toBeNull();
  });

  it("still detects real city/province tokens", () => {
    expect(queryNamesPlace("Edmonton")).toBe("edmonton");
    expect(queryNamesPlace("123 Main St, Alberta")).toBe("alberta");
    expect(queryNamesPlace("Burnaby")).toBe("burnaby");
  });
});

describe("rankCanadianSuggestions", () => {
  const springStreet: AddressSuggestion = {
    id: "street-1",
    label: "Spring Street, Port Moody, BC",
    title: "Spring Street",
    street: "Spring Street",
    city: "Port Moody",
    province: "BC",
    country: "Canada",
    lat: 49.28,
    lng: -122.83,
    source: "photon",
    locationPrecision: "street",
  };

  const metroBias = { latitude: 49.28, longitude: -122.91, radiusMeters: 45_000 };

  it("keeps unit queries matching the civic street number", () => {
    const ranked = rankCanadianSuggestions(
      "Unit 5, 2143 Spring St, Port Moody",
      [springStreet],
      undefined,
      5,
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.label).toMatch(/Unit 5/i);
    expect(ranked[0]?.label).toMatch(/2143/i);
    expect(ranked[0]?.houseNumberRetained).toBe(true);
  });

  it("soft-falls back instead of returning empty when house number misses", () => {
    const other: AddressSuggestion = {
      ...springStreet,
      id: "other",
      label: "Barnet Highway, Port Moody, BC",
      title: "Barnet Highway",
      street: "Barnet Highway",
      houseNumber: "900",
      locationPrecision: "civic",
    };
    const ranked = rankCanadianSuggestions("9999 Nowhere Ave, Port Moody", [other], undefined, 5);
    expect(ranked.length).toBeGreaterThan(0);
  });

  it("prefers Alberta Street Vancouver over same house number in Alberta province", () => {
    const vancouver: AddressSuggestion = {
      id: "van",
      label: "7428 Alberta Street, Vancouver, British Columbia",
      title: "7428 Alberta Street",
      street: "Alberta Street",
      houseNumber: "7428",
      city: "Vancouver",
      province: "BC",
      country: "Canada",
      lat: 49.21,
      lng: -123.1,
      source: "google",
      locationPrecision: "civic",
    };
    const edmonton: AddressSuggestion = {
      id: "edm",
      label: "7428 106 Street North-west, Edmonton, Alberta",
      title: "7428 106 Street North-west",
      street: "106 Street North-west",
      houseNumber: "7428",
      city: "Edmonton",
      province: "Alberta",
      country: "Canada",
      lat: 53.54,
      lng: -113.5,
      source: "google",
      locationPrecision: "civic",
    };
    const grandePrairie: AddressSuggestion = {
      id: "gp",
      label: "7428 103A Street, Grande Prairie, Alberta",
      title: "7428 103A Street",
      street: "103A Street",
      houseNumber: "7428",
      city: "Grande Prairie",
      province: "Alberta",
      country: "Canada",
      lat: 55.17,
      lng: -118.8,
      source: "google",
      locationPrecision: "civic",
    };
    const ranked = rankCanadianSuggestions(
      "Unit 206, 7428 Alberta Street",
      [edmonton, grandePrairie, vancouver],
      metroBias,
      5,
    );
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked.every((row) => /Alberta Street/i.test(row.label))).toBe(true);
    expect(ranked.some((row) => /Edmonton|Grande Prairie|106 Street/i.test(row.label))).toBe(false);
    expect(ranked[0]?.label).toMatch(/Unit 206/i);
  });

  it("matches a partial street prefix like Albert → Alberta Street", () => {
    const albertaStreet: AddressSuggestion = {
      id: "van-st",
      label: "Alberta Street, Vancouver, British Columbia",
      title: "Alberta Street",
      street: "Alberta Street",
      city: "Vancouver",
      province: "BC",
      country: "Canada",
      lat: 49.21,
      lng: -123.1,
      source: "photon",
      locationPrecision: "street",
    };
    const ranked = rankCanadianSuggestions("7428 Albert", [albertaStreet], metroBias, 5);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.label).toMatch(/7428/i);
    expect(ranked[0]?.label).toMatch(/Alberta Street/i);
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

describe("resolveSuggestRegion", () => {
  it("maps IP country codes", () => {
    expect(regionFromIpCountry("tw")).toBe("TW");
    expect(regionFromIpCountry("US")).toBe("US");
    expect(regionFromIpCountry("CA")).toBe("CA");
    expect(regionFromIpCountry("JP")).toBeNull();
  });

  it("uses IP country when the query has no place cues", () => {
    expect(resolveSuggestRegion("1200 Westwood", "TW")).toBe("TW");
    expect(resolveSuggestRegion("1200 Westwood", "US")).toBe("US");
    expect(resolveSuggestRegion("1200 Westwood", null)).toBe("OTHER");
  });

  it("lets typed place cues override IP country", () => {
    expect(resolveSuggestRegion("123 Main St, Vancouver, BC", "TW")).toBe("CA");
    expect(resolveSuggestRegion("台北市信義路五段7號", "CA")).toBe("TW");
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

  it("keeps the Port Moody house point for 2143 clarke and drops US lookalikes", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
    const details: Record<
      string,
      {
        formattedAddress: string;
        lat: number;
        lng: number;
        province: string;
        country: string;
        city?: string;
        houseNumber?: string;
        street?: string;
      }
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
        city: "Port Moody",
        houseNumber: "2143",
        street: "Clarke Street",
      },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("photon.komoot.io")) {
        return jsonResponse({ features: [] });
      }
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
            ...(row.houseNumber
              ? [{ longText: row.houseNumber, shortText: row.houseNumber, types: ["street_number"] }]
              : []),
            ...(row.street
              ? [{ longText: row.street, shortText: row.street, types: ["route"] }]
              : []),
            ...(row.city
              ? [{ longText: row.city, shortText: row.city, types: ["locality"] }]
              : []),
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
        houseNumber: "2143",
        source: "google",
      }),
    );
    expect(results[0]?.houseNumberRetained).toBeFalsy();
    expect(results.some((r) => /Illinois|California|Kentucky|Ontario/i.test(r.label))).toBe(
      false,
    );
  });

  it("prefers a house-number point for 2143 spring street near Metro Vancouver and hides Ontario", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("places:autocomplete")) {
        return jsonResponse({
          suggestions: [
            {
              placePrediction: {
                placeId: "spring-point",
                text: { text: "2143 Spring Street, Port Moody, BC, Canada" },
              },
            },
          ],
        });
      }
      if (url.includes("/v1/places/")) {
        return jsonResponse({
          id: "spring-point",
          formattedAddress: "2143 Spring Street, Port Moody, BC, Canada",
          location: { latitude: 49.281, longitude: -122.855 },
          addressComponents: [
            { longText: "2143", shortText: "2143", types: ["street_number"] },
            { longText: "Spring Street", shortText: "Spring St", types: ["route"] },
            { longText: "Port Moody", shortText: "Port Moody", types: ["locality"] },
            { longText: "British Columbia", shortText: "BC", types: ["administrative_area_level_1"] },
            { longText: "Canada", shortText: "CA", types: ["country"] },
          ],
        });
      }
      if (url.includes("photon.komoot.io")) {
        return jsonResponse({
          features: [
            {
              geometry: { coordinates: [-77.9, 44.0] },
              properties: {
                osm_id: 1,
                street: "Spring Street",
                city: "Cramahe",
                state: "Ontario",
                country: "Canada",
                countrycode: "ca",
              },
            },
          ],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const results = await suggestAddresses("2143 spring street", {
      bias: { latitude: 49.28, longitude: -122.91 },
    });
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(
      expect.objectContaining({
        houseNumber: "2143",
        lat: 49.281,
        lng: -122.855,
        source: "google",
      }),
    );
    expect(results[0]?.houseNumberRetained).toBeUndefined();
    expect(results.some((row) => /Ontario|Cramahe/i.test(row.label))).toBe(false);
  });

  it("uses a DataBC civic point for 2143 Spring Port Moody instead of the street midpoint", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
    const streetMid = { lat: 49.278, lng: -122.87 };
    const building = { lat: 49.2815, lng: -122.8512 };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("places:autocomplete")) {
        return jsonResponse({
          suggestions: [
            {
              placePrediction: {
                placeId: "spring-street",
                text: { text: "Spring Street, Port Moody, BC, Canada" },
              },
            },
          ],
        });
      }
      if (url.includes("/v1/places/")) {
        return jsonResponse({
          id: "spring-street",
          formattedAddress: "Spring Street, Port Moody, BC, Canada",
          location: { latitude: streetMid.lat, longitude: streetMid.lng },
          addressComponents: [
            { longText: "Spring Street", shortText: "Spring St", types: ["route"] },
            { longText: "Port Moody", shortText: "Port Moody", types: ["locality"] },
            { longText: "British Columbia", shortText: "BC", types: ["administrative_area_level_1"] },
            { longText: "Canada", shortText: "CA", types: ["country"] },
          ],
        });
      }
      if (url.includes("photon.komoot.io")) {
        return jsonResponse({
          features: [
            {
              geometry: { coordinates: [streetMid.lng, streetMid.lat] },
              properties: {
                osm_id: 21,
                street: "Spring Street",
                city: "Port Moody",
                state: "British Columbia",
                country: "Canada",
                countrycode: "ca",
              },
            },
          ],
        });
      }
      if (url.includes("geocoder.api.gov.bc.ca")) {
        expect(url).toContain("interpolation=none");
        expect(url).toContain("location=");
        return jsonResponse({
          features: [
            {
              geometry: { coordinates: [building.lng, building.lat] },
              properties: {
                fullAddress: "2143 SPRING ST, PORT MOODY, BC",
                civicNumber: "2143",
                streetName: "SPRING ST",
                localityName: "PORT MOODY",
                provinceCode: "BC",
                matchPrecision: "CIVIC_NUMBER",
                score: 100,
              },
            },
            {
              geometry: { coordinates: [streetMid.lng, streetMid.lat] },
              properties: {
                fullAddress: "SPRING ST, PORT MOODY, BC",
                streetName: "SPRING ST",
                localityName: "PORT MOODY",
                provinceCode: "BC",
                matchPrecision: "STREET",
                score: 80,
              },
            },
          ],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const results = await suggestAddresses("2143 Spring Port Moody");
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(
      expect.objectContaining({
        source: "bc_geocoder",
        locationPrecision: "civic",
        houseNumber: "2143",
        lat: building.lat,
        lng: building.lng,
      }),
    );
    expect(results[0]?.houseNumberRetained).toBeUndefined();
    expect(results[0]?.lat).not.toBe(streetMid.lat);
  });

  it("still offers a street hint when DataBC is down", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("places:autocomplete")) return jsonResponse({ suggestions: [] });
      if (url.includes("photon.komoot.io")) {
        return jsonResponse({
          features: [
            {
              geometry: { coordinates: [-122.86, 49.28] },
              properties: {
                osm_id: 8,
                street: "Spring Street",
                city: "Port Moody",
                state: "British Columbia",
                country: "Canada",
                countrycode: "ca",
              },
            },
          ],
        });
      }
      if (url.includes("geocoder.api.gov.bc.ca")) {
        return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const results = await suggestAddresses("2143 Spring Port Moody");
    expect(results).toHaveLength(1);
    expect(results[0]?.locationPrecision).toBe("street");
    expect(results[0]?.houseNumberRetained).toBe(true);
  });

  it("keeps the typed house number on the nearest street when no source has that point", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("places:autocomplete")) return jsonResponse({ suggestions: [] });
      if (url.includes("photon.komoot.io")) {
        return jsonResponse({
          features: [
            {
              geometry: { coordinates: [-77.9, 44.0] },
              properties: {
                osm_id: 9,
                street: "Spring Street",
                city: "Cramahe",
                state: "Ontario",
                country: "Canada",
                countrycode: "ca",
              },
            },
            {
              geometry: { coordinates: [-122.86, 49.28] },
              properties: {
                osm_id: 8,
                street: "Spring Street",
                city: "Port Moody",
                state: "British Columbia",
                country: "Canada",
                countrycode: "ca",
              },
            },
          ],
        });
      }
      if (url.includes("geocoder.api.gov.bc.ca")) return jsonResponse({ features: [] });
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const results = await suggestAddresses("2143 spring street");
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(
      expect.objectContaining({
        houseNumberRetained: true,
        locationPrecision: "street",
        houseNumber: "2143",
        lat: 49.28,
        lng: -122.86,
        source: "photon",
      }),
    );
    expect(results[0]?.label.toLowerCase()).toContain("2143");
    expect(results[0]?.label).not.toMatch(/Ontario/i);
  });

  it("returns the Ontario house point when the query names Ontario or Cramahe", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("places:autocomplete")) {
        const body = JSON.parse(String(init?.body)) as { locationBias?: unknown };
        expect(body.locationBias).toBeUndefined();
        return jsonResponse({ suggestions: [] });
      }
      if (url.includes("photon.komoot.io")) {
        expect(url).not.toContain("lat=49.28");
        return jsonResponse({
          features: [
            {
              geometry: { coordinates: [-122.86, 49.28] },
              properties: {
                osm_id: 3,
                housenumber: "2143",
                street: "Spring Street",
                city: "Port Moody",
                state: "British Columbia",
                country: "Canada",
                countrycode: "ca",
              },
            },
            {
              geometry: { coordinates: [-77.9, 44.0] },
              properties: {
                osm_id: 4,
                housenumber: "2143",
                street: "Spring Street",
                city: "Cramahe",
                state: "Ontario",
                country: "Canada",
                countrycode: "ca",
              },
            },
          ],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    for (const query of ["2143 Spring Street, Cramahe", "2143 Spring Street, Ontario"]) {
      const results = await suggestAddresses(query);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(
        expect.objectContaining({
          houseNumber: "2143",
          city: "Cramahe",
          lat: 44.0,
          lng: -77.9,
        }),
      );
    }
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
