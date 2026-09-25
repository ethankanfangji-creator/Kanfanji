import { describe, expect, it } from "vitest";
import {
  buildAddressConfirmationCandidate,
  buildMapUrls,
  candidateFromSuggestion,
} from "./address-confirmation";

describe("buildMapUrls", () => {
  it("builds OSM embed and open URLs around the point", () => {
    const urls = buildMapUrls(49.28, -123.12);
    expect(urls.mapEmbedUrl).toContain("openstreetmap.org/export/embed.html");
    expect(urls.mapEmbedUrl).toContain("marker=49.28%2C-123.12");
    expect(urls.openMapUrl).toContain("mlat=49.28");
    expect(urls.openMapUrl).toContain("mlon=-123.12");
  });
});

describe("buildAddressConfirmationCandidate", () => {
  it("prefers displayAddress and extracts property id + coords", () => {
    const candidate = buildAddressConfirmationCandidate(
      {
        displayAddress: "1200 Westwood Street, Coquitlam, BC",
        propertyId: "prop-abc",
        market: "CA",
        source: "bc-geocoder",
        tags: ["Coquitlam"],
        details: { lat: 49.28, lng: -122.79 },
      },
      "1200 westwood",
    );
    expect(candidate).toEqual(
      expect.objectContaining({
        displayAddress: "1200 Westwood Street, Coquitlam, BC",
        propertyId: "prop-abc",
        lat: 49.28,
        lng: -122.79,
        market: "CA",
        source: "bc-geocoder",
        tags: ["Coquitlam"],
        adminDistrictMismatch: false,
      }),
    );
    expect(candidate?.mapEmbedUrl).toContain("openstreetmap.org");
    expect(candidate?.openMapUrl).toContain("openstreetmap.org");
  });

  it("falls back to query address and nested propertyId", () => {
    const candidate = buildAddressConfirmationCandidate(
      {
        details: {
          propertyId: "nested-id",
          normalizedAddress: "  ",
          lat: "49.1",
          lng: "-122.5",
        },
      },
      "88 Kingsway",
    );
    expect(candidate?.displayAddress).toBe("88 Kingsway");
    expect(candidate?.propertyId).toBe("nested-id");
    expect(candidate?.lat).toBe(49.1);
    expect(candidate?.lng).toBe(-122.5);
  });

  it("returns null when there is no displayable address", () => {
    expect(buildAddressConfirmationCandidate({}, "   ")).toBeNull();
  });

  it("omits map urls when coordinates are missing", () => {
    const candidate = buildAddressConfirmationCandidate(
      { displayAddress: "Somewhere" },
      "Somewhere",
    );
    expect(candidate?.mapEmbedUrl).toBeNull();
    expect(candidate?.openMapUrl).toBeNull();
  });

  it("flags Taiwan city-level admin mismatch between query and display", () => {
    const candidate = buildAddressConfirmationCandidate(
      {
        displayAddress: "新北市新莊區福祿街附近",
        market: "TW",
      },
      "台北市市府路1號",
    );
    expect(candidate?.adminDistrictMismatch).toBe(true);
  });

  it("does not flag matching Taipei admin tokens (台/臺)", () => {
    const candidate = buildAddressConfirmationCandidate(
      {
        displayAddress: "臺北市信義區市府路1號",
        market: "TW",
      },
      "台北市市府路1號",
    );
    expect(candidate?.adminDistrictMismatch).toBe(false);
  });
});

describe("candidateFromSuggestion", () => {
  it("copies formatted coordinates and id without a label lookup", () => {
    const candidate = candidateFromSuggestion(
      {
        id: "gplace:clarke-2143",
        label: "2143 Clarke Street, Port Moody, BC, Canada",
        formatted: "2143 Clarke Street, Port Moody, BC, Canada",
        lat: 49.277,
        lng: -122.862,
        province: "BC",
        country: "Canada",
        source: "google",
      },
      "2143 clarke",
    );
    expect(candidate).toEqual(
      expect.objectContaining({
        displayAddress: "2143 Clarke Street, Port Moody, BC, Canada",
        propertyId: "gplace:clarke-2143",
        lat: 49.277,
        lng: -122.862,
        market: "CA",
        source: "google",
      }),
    );
  });

  it("returns null when the suggestion has no coordinates", () => {
    expect(
      candidateFromSuggestion({
        id: "gplace:missing",
        label: "somewhere",
        source: "google",
      }),
    ).toBeNull();
  });
});
