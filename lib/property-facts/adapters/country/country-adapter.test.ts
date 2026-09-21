import { describe, expect, it } from "vitest";
import type { GeocodeResult } from "../../geocode";
import { deriveJurisdiction, jurisdictionKey } from "../../jurisdiction";
import {
  CanadaAdapter,
  OtherCountryAdapter,
  selectCountryAdapter,
  TaiwanAdapter,
  UnitedStatesAdapter,
} from "./registry";

function fakeGeo(
  region: "US" | "CA" | "TW" | "OTHER",
  opts: {
    admin1?: string;
    city?: string;
    county?: string;
    municipality?: string;
    district?: string;
  },
): GeocodeResult {
  const jurisdiction = deriveJurisdiction({
    region,
    query: opts.city || "x",
    admin1: opts.admin1 ?? null,
    city: opts.city ?? null,
    county: opts.county ?? null,
    municipality: opts.municipality ?? opts.city ?? null,
    district: opts.district ?? null,
  });
  return {
    region,
    displayAddress: opts.city || "x",
    countryCode: region === "OTHER" ? null : region,
    admin1: opts.admin1 ?? null,
    city: opts.city ?? null,
    postalCode: null,
    jurisdiction,
    jurisdictionKey: jurisdictionKey(jurisdiction),
    lat: 1,
    lng: 2,
    placeId: null,
    streetNumber: "1",
    streetName: "Main",
    geocodeOk: true,
    identityEvidence: [],
    sourceId: "test",
  };
}

describe("UnitedStatesAdapter", () => {
  it("resolves Seattle with USD, HOA label, attom preferred", () => {
    const adapter = new UnitedStatesAdapter();
    const resolved = adapter.resolve(
      fakeGeo("US", { admin1: "WA", city: "Seattle", county: "King" }),
    );
    expect(resolved.region).toBe("US");
    expect(resolved.jurisdictionKey).toMatch(/^us:wa:king:seattle/);
    expect(resolved.adapter.units.currency).toBe("USD");
    expect(resolved.adapter.units.area).toBe("sqft");
    expect(resolved.adapter.fee_label).toMatch(/HOA/i);
    expect(resolved.adapter.providers_preferred).toContain("attom");
    expect(resolved.adapter.providers_disabled).toContain("metro_vancouver_open");
    expect(resolved.adapter.legal_notices.some((n) => /MLS|不爬取/i.test(n))).toBe(
      true,
    );
    expect(resolved.adapter.structural_gaps).toContain("risks.flood");
  });
});

describe("CanadaAdapter", () => {
  it("enables Metro Vancouver open data for Burnaby BC", () => {
    const adapter = new CanadaAdapter();
    const resolved = adapter.resolve(
      fakeGeo("CA", { admin1: "BC", city: "Burnaby", municipality: "Burnaby" }),
    );
    expect(resolved.adapter.units.currency).toBe("CAD");
    expect(resolved.adapter.fee_label).toMatch(/Strata/i);
    expect(resolved.adapter.providers_preferred).toContain("metro_vancouver_open");
    expect(resolved.adapter.available_data_types).toContain("parcel");
    expect(resolved.adapter.legal_notices.some((n) => /French|法文/i.test(n))).toBe(
      true,
    );
  });

  it("disables metro open data for Toronto ON and adds parcel gaps", () => {
    const adapter = new CanadaAdapter();
    const resolved = adapter.resolve(
      fakeGeo("CA", { admin1: "ON", city: "Toronto", municipality: "Toronto" }),
    );
    expect(resolved.adapter.providers_disabled).toContain("metro_vancouver_open");
    expect(resolved.adapter.structural_gaps).toEqual(
      expect.arrayContaining(["parcel", "risks.zoning"]),
    );
    expect(resolved.adapter.providers_preferred).not.toContain("attom");
  });
});

describe("TaiwanAdapter", () => {
  it("uses TWD, ping, management fee labels and building-abstract gaps", () => {
    const adapter = new TaiwanAdapter();
    const resolved = adapter.resolve(
      fakeGeo("TW", { admin1: "台北市", city: "台北市", district: "大安區" }),
    );
    expect(resolved.region).toBe("TW");
    expect(resolved.jurisdictionKey).toMatch(/^tw:/);
    expect(resolved.adapter.units.currency).toBe("TWD");
    expect(resolved.adapter.units.area).toBe("ping");
    expect(resolved.adapter.fee_label_zh).toBe("管理費");
    expect(resolved.adapter.localized_labels.labels["property.building_area"]).toMatch(
      /坪/,
    );
    expect(resolved.adapter.structural_gaps).toContain("parcel");
    expect(resolved.adapter.legal_notices.some((n) => /謄本|不爬取/i.test(n))).toBe(
      true,
    );
    expect(resolved.adapter.providers_disabled).toContain("attom");
  });
});

describe("OtherCountryAdapter", () => {
  it("does not invent local market coverage", () => {
    const adapter = new OtherCountryAdapter();
    const resolved = adapter.resolve(fakeGeo("OTHER", { city: "Somewhere" }));
    expect(resolved.adapter.available_data_types).toEqual(
      expect.arrayContaining(["geocode", "poi"]),
    );
    expect(resolved.adapter.structural_gaps).toContain("market.currency");
    expect(resolved.adapter.providers_disabled).toContain("attom");
  });
});

describe("selectCountryAdapter", () => {
  it("routes regions", () => {
    expect(selectCountryAdapter("US")).toBeInstanceOf(UnitedStatesAdapter);
    expect(selectCountryAdapter("CA")).toBeInstanceOf(CanadaAdapter);
    expect(selectCountryAdapter("TW")).toBeInstanceOf(TaiwanAdapter);
    expect(selectCountryAdapter("OTHER")).toBeInstanceOf(OtherCountryAdapter);
  });
});
