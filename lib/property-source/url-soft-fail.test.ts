import { afterEach, describe, expect, it, vi } from "vitest";

const fetchListingMock = vi.fn();

vi.mock("./fetch-listing-url", () => ({
  fetchAndExtractListingUrl: (...args: unknown[]) => fetchListingMock(...args),
}));

import { runPropertySourcePipeline } from "./pipeline";
import {
  isUrlSoftFailCode,
  sourceExtractErrorMessage,
} from "./error-messages";

describe("listing_url soft-fail", () => {
  afterEach(() => {
    fetchListingMock.mockReset();
  });

  it("keeps URL source when login_required and still builds a report", async () => {
    fetchListingMock.mockResolvedValue({
      ok: false,
      errorCode: "login_required",
      errorMessage: "wall",
    });

    const result = await runPropertySourcePipeline({
      sourceType: "listing_url",
      url: "https://example.com/listing/locked",
      address: "123 Main St, Seattle, WA 98101",
      locale: "zh-Hant",
    });

    expect(result.source.sourceType).toBe("listing_url");
    expect(result.source.sourceUrl).toBe("https://example.com/listing/locked");
    expect(result.source.publisher).toBe("example.com");
    expect(result.source.confidence).toBeGreaterThan(0);
    expect(result.source.extractionErrors).toContain("login_required");
    expect(result.sources).toHaveLength(1);
    expect(result.report).not.toBeNull();
    expect(result.enrichNotes.join("")).toMatch(/連結已記錄|不開放/);
    expect(result.steps.find((s) => s.step === "extract")?.status).toBe("error");
  });

  it("extracts when fetch succeeds after soft wall", async () => {
    fetchListingMock.mockResolvedValue({
      ok: true,
      sourceUrl: "https://example.com/listing/1",
      extractedText: "Asking $500,000 3 bed 2 bath 1,200 sqft",
      publisher: "example.com",
      contentType: "text/html",
    });

    const result = await runPropertySourcePipeline({
      sourceType: "listing_url",
      url: "https://example.com/listing/1",
      address: "123 Main St, Seattle, WA 98101",
    });

    expect(result.source.extractionErrors).toHaveLength(0);
    expect(result.source.extractedText).toMatch(/500,000/);
    expect(result.propertyData.listing.bedrooms.value).toBe(3);
  });
});

describe("sourceExtractErrorMessage", () => {
  it("clarifies Kanfangji is not the login wall", () => {
    const zh = sourceExtractErrorMessage("login_required", "zh-Hant");
    expect(zh).toMatch(/不是要你登入本 App/);
    expect(isUrlSoftFailCode("login_required")).toBe(true);
    const en = sourceExtractErrorMessage("login_required", "en");
    expect(en.toLowerCase()).toMatch(/not a kanfangji login/);
  });
});
