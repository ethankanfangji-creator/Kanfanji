import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, consumeAiQuota, requestListingExtract, fetchAndExtractListingUrl, extractTextFromPdfBase64, saveListingOnProperty } =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    consumeAiQuota: vi.fn(),
    requestListingExtract: vi.fn(),
    fetchAndExtractListingUrl: vi.fn(),
    extractTextFromPdfBase64: vi.fn(),
    saveListingOnProperty: vi.fn(),
  }));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: "11111111-1111-4111-8111-111111111111",
              user_id: "user-1",
              property_id: "property-1",
              address: "88 Main St",
              property: {},
            },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/entitlement/tier", () => ({
  getAccountTier: async () => "free",
}));
vi.mock("@/lib/ai-boundary/quota", () => ({
  consumeAiQuota,
}));
vi.mock("@/lib/listing-extract", () => ({
  requestListingExtract,
}));
vi.mock("@/lib/listing-extract-save", () => ({
  ListingSaveError: class ListingSaveError extends Error {},
  saveListingOnProperty,
}));
vi.mock("@/lib/property-source/fetch-listing-url", () => ({
  fetchAndExtractListingUrl,
}));
vi.mock("@/lib/property-source/extract-pdf", () => ({
  extractTextFromPdfBase64,
}));

import { POST } from "./route";

const viewingId = "11111111-1111-4111-8111-111111111111";
const listing = {
  address: "88 Main St",
  price: "$900,000",
  beds: 3,
  baths: 2,
  sqft: 1200,
  year: 1998,
  strata: "$420",
  type: "condo",
  photos: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  consumeAiQuota.mockResolvedValue({ allowed: true, tier: "free" });
  requestListingExtract.mockResolvedValue(listing);
  saveListingOnProperty.mockResolvedValue("property-1");
  fetchAndExtractListingUrl.mockResolvedValue({
    ok: true,
    sourceUrl: "https://listings.example/88",
    extractedText: "88 Main St $900,000 3 bed",
    publisher: "listings.example",
    contentType: "text/html",
    photoUrls: [],
  });
});

describe("POST /api/extract-listing", () => {
  it("returns 401 and does not call the model when logged out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await POST(
      new Request("https://example.test/api/extract-listing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ viewing_id: viewingId, listing_url: "https://listings.example/88" }),
      }),
    );
    expect(response.status).toBe(401);
    expect(requestListingExtract).not.toHaveBeenCalled();
    expect(consumeAiQuota).not.toHaveBeenCalled();
    expect(fetchAndExtractListingUrl).not.toHaveBeenCalled();
  });

  it("returns the existing quota payload and does not call the model when the quota is used up", async () => {
    consumeAiQuota.mockResolvedValue({
      allowed: false,
      code: "ai_quota_exceeded",
      tier: "free",
      limit: "tier",
      retryAfter: null,
      resetsAt: null,
    });
    const response = await POST(
      new Request("https://example.test/api/extract-listing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ viewing_id: viewingId, listing_url: "https://zillow.example/homedetails/88" }),
      }),
    );
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: "AI request could not be completed.",
      code: "ai_quota_exceeded",
      tier: "free",
      limit: "tier",
      resetsAt: null,
    });
    expect(requestListingExtract).not.toHaveBeenCalled();
    expect(saveListingOnProperty).not.toHaveBeenCalled();
  });

  it("returns the fetch error and does not pretend success", async () => {
    fetchAndExtractListingUrl.mockResolvedValue({
      ok: false,
      errorCode: "empty_or_dynamic",
      errorMessage: "無法擷取足夠的頁面文字",
    });
    const response = await POST(
      new Request("https://example.test/api/extract-listing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ viewing_id: viewingId, listing_url: "https://realtor.example/listing" }),
      }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "無法擷取足夠的頁面文字",
      code: "empty_or_dynamic",
    });
    expect(requestListingExtract).not.toHaveBeenCalled();
    expect(consumeAiQuota).not.toHaveBeenCalled();
  });

  it("saves a link extract onto the existing property", async () => {
    const response = await POST(
      new Request("https://example.test/api/extract-listing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ viewing_id: viewingId, listing_url: "https://listings.example/88" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ listing, propertyId: "property-1" });
    expect(saveListingOnProperty).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ property_id: "property-1" }),
      listing,
    );
  });

  it("sends a photo to the model", async () => {
    const form = new FormData();
    form.set("viewing_id", viewingId);
    form.set("file", new File([Uint8Array.from([1, 2, 3])], "room.jpg", { type: "image/jpeg" }));
    const response = await POST(
      new Request("https://example.test/api/extract-listing", { method: "POST", body: form }),
    );
    expect(response.status).toBe(200);
    expect(requestListingExtract).toHaveBeenCalledWith(
      expect.objectContaining({
        image: expect.objectContaining({ mime: "image/jpeg" }),
      }),
    );
    expect(fetchAndExtractListingUrl).not.toHaveBeenCalled();
  });
});
