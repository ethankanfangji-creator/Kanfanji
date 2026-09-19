import { describe, expect, it } from "vitest";
import { normalizePropertyBasics } from "./types";

describe("normalizePropertyBasics", () => {
  it("forces listing economics to unknown even if the model invents them", () => {
    const snap = normalizePropertyBasics(
      {
        displayName: { value: "1200 Westwood", confidence: "verified" },
        propertyType: { value: "condo", confidence: "inferred" },
        price: { value: "$1,200,000", confidence: "verified" },
        area: { value: "850 sqft", confidence: "verified" },
        layout: { value: "2B2B", confidence: "verified" },
        managementFee: { value: "$350", confidence: "verified" },
        summary: { value: "Low-rise near transit", confidence: "inferred" },
      },
      "1200 Westwood St, Vancouver",
      ["BC Geocoder"],
    );
    expect(snap.price.value).toBeNull();
    expect(snap.price.confidence).toBe("unknown");
    expect(snap.area.value).toBeNull();
    expect(snap.managementFee.value).toBeNull();
    expect(snap.propertyType.value).toBe("condo");
    expect(snap.displayName.value).toBe("1200 Westwood");
    expect(snap.sources).toContain("BC Geocoder");
  });

  it("preserves needsAddressConfirmation refusals", () => {
    const snap = normalizePropertyBasics(
      {
        needsAddressConfirmation: true,
        message: "Please confirm the address first.",
      },
      "",
      [],
    );
    expect(snap.needsAddressConfirmation).toBe(true);
    expect(snap.message).toMatch(/confirm/i);
  });
});
