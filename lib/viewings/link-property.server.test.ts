import { afterEach, describe, expect, it, vi } from "vitest";

const { findOrCreateProperty } = vi.hoisted(() => ({
  findOrCreateProperty: vi.fn(),
}));

vi.mock("@/lib/properties", () => ({ findOrCreateProperty }));

import {
  linkViewingToProperty,
  readChatStateLinkFields,
} from "./link-property.server";

afterEach(() => {
  vi.clearAllMocks();
});

describe("linkViewingToProperty", () => {
  it("returns the property id from the registry", async () => {
    findOrCreateProperty.mockResolvedValue("prop-1");
    await expect(
      linkViewingToProperty({} as never, {
        address: "Unit 5, 2143 Spring St, Port Moody",
        countryCode: "CA",
        lat: 49.28,
        lng: -122.85,
      }),
    ).resolves.toBe("prop-1");
    expect(findOrCreateProperty).toHaveBeenCalledWith(
      expect.objectContaining({
        unitKey: "5",
        unitLabel: "Unit 5",
        countryCode: "CA",
      }),
    );
  });

  it("soft-fails to null when registry throws", async () => {
    findOrCreateProperty.mockRejectedValue(new Error("down"));
    await expect(
      linkViewingToProperty({} as never, { address: "2143 Spring St" }),
    ).resolves.toBeNull();
  });
});

describe("readChatStateLinkFields", () => {
  it("reads sitePin and unit fields", () => {
    expect(
      readChatStateLinkFields({
        v: 1,
        sitePin: { lat: 1, lng: 2, source: "civic" },
        unitKey: "5",
        unitLabel: "Unit 5",
        placeId: "place-1",
        countryCode: "CA",
      }),
    ).toEqual({
      lat: 1,
      lng: 2,
      unitKey: "5",
      unitLabel: "Unit 5",
      placeId: "place-1",
      countryCode: "CA",
    });
  });
});
