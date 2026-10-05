import { describe, expect, it } from "vitest";
import {
  canonicalizeUnitKey,
  displayUnitLabel,
  resolvePropertyIdentity,
} from "./property-identity";

describe("canonicalizeUnitKey", () => {
  it.each([
    ["", ""],
    [null, ""],
    ["Unit 5", "5"],
    ["unit #1202", "1202"],
    ["#1202", "1202"],
    ["Apt 12", "12"],
    ["Apt. 12B", "12b"],
    ["Suite 3", "3"],
    ["1202", "1202"],
    ["1202A", "1202a"],
    ["5樓", "floor:5"],
    ["12层", "floor:12"],
    ["之3", "zhi:3"],
    ["戶A", "hu:a"],
  ])("maps %s → %s", (input, expected) => {
    expect(canonicalizeUnitKey(input)).toBe(expected);
  });
});

describe("displayUnitLabel", () => {
  it("normalizes english unit forms", () => {
    expect(displayUnitLabel("5")).toBe("Unit 5");
    expect(displayUnitLabel("#1202")).toBe("Unit 1202");
    expect(displayUnitLabel("unit 5")).toBe("Unit 5");
    expect(displayUnitLabel("Apt 12")).toBe("Apt 12");
  });

  it("keeps TW tokens compact", () => {
    expect(displayUnitLabel("5樓")).toBe("5樓");
    expect(displayUnitLabel("戶 A")).toBe("戶A");
  });
});

describe("resolvePropertyIdentity", () => {
  it("strips Unit prefix into unit_key and street-only address", () => {
    const id = resolvePropertyIdentity({
      address: "Unit 5, 2143 Spring St, Port Moody, BC",
      countryCode: "CA",
      lat: 49.28,
      lng: -122.85,
    });
    expect(id.unitKey).toBe("5");
    expect(id.unitLabel).toBe("Unit 5");
    expect(id.streetNormalized).toBe("2143 spring st, port moody, bc");
    expect(id.countryCode).toBe("CA");
    expect(id.lat).toBe(49.28);
    expect(id.lng).toBe(-122.85);
  });

  it("handles dashed unit-house forms", () => {
    const id = resolvePropertyIdentity({
      address: "#1202-2143 Spring St, Port Moody, BC",
      countryCode: "ca",
    });
    expect(id.unitKey).toBe("1202");
    expect(id.streetNormalized).toContain("2143 spring st");
    expect(id.countryCode).toBe("CA");
  });

  it("uses explicit unitLabel when address is street-only", () => {
    const id = resolvePropertyIdentity({
      address: "2143 Spring Street, Port Moody",
      unitLabel: "Apt 9",
      countryCode: "CA",
    });
    expect(id.unitKey).toBe("9");
    expect(id.unitLabel).toBe("Apt 9");
    expect(id.streetNormalized).toBe("2143 spring st, port moody");
  });

  it("keeps different units as different identities", () => {
    const a = resolvePropertyIdentity({
      address: "Unit 5, 2143 Spring St, Port Moody",
      countryCode: "CA",
    });
    const b = resolvePropertyIdentity({
      address: "Unit 6, 2143 Spring St, Port Moody",
      countryCode: "CA",
    });
    expect(a.streetNormalized).toBe(b.streetNormalized);
    expect(a.unitKey).not.toBe(b.unitKey);
  });

  it("drops invalid coordinates", () => {
    const id = resolvePropertyIdentity({
      address: "2143 Spring St",
      lat: 91,
      lng: -123,
    });
    expect(id.lat).toBeNull();
    expect(id.lng).toBeNull();
  });

  it("parses TW floor units", () => {
    const id = resolvePropertyIdentity({
      address: "5樓中山路一段1號, 臺中市",
      countryCode: "TW",
    });
    expect(id.unitKey).toBe("floor:5");
    expect(id.streetNormalized).toContain("中山路");
  });
});
