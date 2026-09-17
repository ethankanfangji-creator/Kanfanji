import { describe, expect, it } from "vitest";
import {
  fillEmptyText,
  mergeAddressLookupPropertyDraft,
  resolveLookupDisplayAddress,
} from "./address-autofill";

describe("address autofill merge", () => {
  it("keeps the user-typed address instead of the geocoder display address", () => {
    expect(resolveLookupDisplayAddress("我打的地址", "123 Main St, Vancouver")).toBe(
      "我打的地址",
    );
    expect(resolveLookupDisplayAddress("  ", "123 Main St")).toBe("123 Main St");
  });

  it("only fills empty form strings", () => {
    expect(fillEmptyText("已有單位", "1202")).toBe("已有單位");
    expect(fillEmptyText("", "1202")).toBe("1202");
  });

  it("merges open-data details without wiping user setup fields", () => {
    const merged = mergeAddressLookupPropertyDraft(
      {
        unitLabel: "12A",
        priceLabel: "88萬",
        decisionSummaryDraft: { keep: true },
        city: "Old City",
      },
      {
        source: "BC Geocoder",
        propertyId: "prop-1",
        details: {
          city: "Vancouver",
          neighborhood: "Kits",
          openData: { zoningCode: "RM-4" },
          unitLabel: "SHOULD_NOT_APPLY",
        },
      },
    );

    expect(merged).toMatchObject({
      unitLabel: "12A",
      priceLabel: "88萬",
      decisionSummaryDraft: { keep: true },
      city: "Vancouver",
      neighborhood: "Kits",
      source: "BC Geocoder",
      propertyId: "prop-1",
      openData: { zoningCode: "RM-4" },
    });
  });
});
