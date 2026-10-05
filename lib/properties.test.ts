import { afterEach, describe, expect, it, vi } from "vitest";

const { createAdminClient, rpc } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/utils/supabase/admin", () => ({ createAdminClient }));

import { findOrCreateProperty } from "./properties";

afterEach(() => {
  vi.clearAllMocks();
});

describe("property registry client", () => {
  it("sends street + unit identity and allows null coordinates", async () => {
    createAdminClient.mockReturnValue({ rpc });
    rpc.mockResolvedValue({
      data: "c92a071b-4148-4fb0-96ea-f7d50f72d9e2",
      error: null,
    });

    await expect(
      findOrCreateProperty({
        normalizedAddress: "Unit 5, 2143 Spring St, Port Moody, BC",
        countryCode: "CA",
      }),
    ).resolves.toBe("c92a071b-4148-4fb0-96ea-f7d50f72d9e2");

    expect(createAdminClient).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      "find_or_create_property",
      expect.objectContaining({
        p_normalized_address: "2143 spring st, port moody, bc",
        p_unit_key: "5",
        p_unit_label: "Unit 5",
        p_country_code: "CA",
        p_lat: null,
        p_lng: null,
      }),
    );
  });

  it("keeps different units as distinct RPC keys", async () => {
    createAdminClient.mockReturnValue({ rpc });
    rpc.mockResolvedValue({ data: "id-a", error: null });

    await findOrCreateProperty({
      normalizedAddress: "2143 Spring St",
      unitLabel: "Unit 5",
      lat: 49.28,
      lng: -122.85,
      countryCode: "CA",
    });
    await findOrCreateProperty({
      normalizedAddress: "2143 Spring St",
      unitLabel: "Unit 6",
      lat: 49.28,
      lng: -122.85,
      countryCode: "CA",
    });

    expect(rpc.mock.calls[0][1].p_unit_key).toBe("5");
    expect(rpc.mock.calls[1][1].p_unit_key).toBe("6");
    expect(rpc.mock.calls[0][1].p_normalized_address).toBe(
      rpc.mock.calls[1][1].p_normalized_address,
    );
  });

  it.each([
    { normalizedAddress: "  ", lat: 49, lng: -123 },
    { normalizedAddress: "12", lat: 49, lng: -123 },
    { normalizedAddress: "123\nmain", lat: 49, lng: -123 },
    { normalizedAddress: "123 main", lat: Number.NaN, lng: -123 },
    { normalizedAddress: "123 main", lat: 91, lng: -123 },
    { normalizedAddress: "123 main", lat: 49, lng: -181 },
  ])("rejects invalid input before creating a client", async (input) => {
    await expect(findOrCreateProperty(input)).rejects.toThrow(/格式無效/);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("propagates a missing admin configuration without a client fallback", async () => {
    createAdminClient.mockImplementation(() => {
      throw new Error("missing service role");
    });

    await expect(
      findOrCreateProperty({
        normalizedAddress: "123 main st",
        lat: 49.2827,
        lng: -123.1207,
      }),
    ).rejects.toThrow("missing service role");
    expect(rpc).not.toHaveBeenCalled();
  });
});
