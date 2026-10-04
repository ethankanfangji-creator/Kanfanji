import { beforeEach, describe, expect, it, vi } from "vitest";

const { lookupByAddress } = vi.hoisted(() => ({
  lookupByAddress: vi.fn(),
}));

vi.mock("@/lib/services/address/server-adapter", () => ({
  createServerAddressService: () => ({
    lookupByAddress,
  }),
}));

import { GET } from "./route";

function get(q: string) {
  return new Request(`https://example.test/api/address-lookup?q=${encodeURIComponent(q)}&locale=en`);
}

beforeEach(() => {
  lookupByAddress.mockReset();
});

describe("GET /api/address-lookup", () => {
  it("looks up the street query without the unit and reattaches Unit to the label", async () => {
    lookupByAddress.mockResolvedValue({
      displayAddress: "2143 Spring Street, Port Moody, BC",
      propertyId: null,
      market: "CA",
      source: "photon",
      details: {
        lat: 49.28,
        lng: -122.83,
        normalizedAddress: "2143 Spring Street, Port Moody, BC",
      },
    });

    const response = await GET(get("Unit 5, 2143 Spring St, Port Moody"));
    expect(response.status).toBe(200);
    expect(lookupByAddress).toHaveBeenCalledWith(
      "2143 Spring St, Port Moody",
      expect.any(AbortSignal),
    );
    const body = (await response.json()) as {
      displayAddress: string;
      details: { normalizedAddress: string };
    };
    expect(body.displayAddress).toBe("Unit 5, 2143 Spring Street, Port Moody, BC");
    expect(body.details.normalizedAddress).toBe("Unit 5, 2143 Spring Street, Port Moody, BC");
  });

  it("returns 404 when lookup has no display address", async () => {
    lookupByAddress.mockResolvedValue({
      displayAddress: "",
      details: { lat: null, lng: null, normalizedAddress: "" },
    });
    const response = await GET(get("9999 Nowhere Ave"));
    expect(response.status).toBe(404);
  });
});
