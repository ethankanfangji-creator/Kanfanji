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
  it("uses only the admin client and sends the canonical address", async () => {
    createAdminClient.mockReturnValue({ rpc });
    rpc.mockResolvedValue({
      data: "c92a071b-4148-4fb0-96ea-f7d50f72d9e2",
      error: null,
    });

    await expect(
      findOrCreateProperty({
        normalizedAddress: "  123 MAIN St  ",
        lat: 49.2827,
        lng: -123.1207,
      }),
    ).resolves.toBe("c92a071b-4148-4fb0-96ea-f7d50f72d9e2");

    expect(createAdminClient).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      "find_or_create_property",
      expect.objectContaining({ p_normalized_address: "123 main st" }),
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
