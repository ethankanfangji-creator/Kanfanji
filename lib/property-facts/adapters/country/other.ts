import type { GeocodeResult } from "../../geocode";
import { deriveJurisdiction, jurisdictionKey } from "../../jurisdiction";
import type { CountryAdapter, CountryResolution } from "../../interfaces";
import { baseLabelsZh, toSnapshot } from "./base";
import type { CountryUnits, ProviderSelection } from "./types";

/** Minimal fallback when region is OTHER — no invented local currency facts. */
export class OtherCountryAdapter implements CountryAdapter {
  readonly region = "OTHER" as const;
  readonly id = "OtherCountryAdapter";

  resolve(geo: GeocodeResult): CountryResolution {
    const jurisdiction =
      geo.jurisdiction.region === "OTHER"
        ? geo.jurisdiction
        : deriveJurisdiction({
            region: "OTHER",
            query: geo.displayAddress || "",
            admin1: geo.admin1,
            city: geo.city,
          });
    const providers: ProviderSelection = {
      preferred: ["google_maps", "osm_nominatim", "bing_search"],
      disabled: [
        "attom",
        "metro_vancouver_open",
        "mls_crea_ddf",
        "building_abstract",
        "hoa_condo_docs",
        "government_cadastre",
      ],
      reasons: {
        attom: "Out of supported property markets",
        metro_vancouver_open: "Out of supported property markets",
      },
    };
    const units: CountryUnits = {
      area: "m2",
      currency: "USD",
      feeLabel: "Management / HOA fee (unconfirmed market)",
      feeLabelZh: "管理費（市場未支援，勿臆造幣別金額）",
    };
    const snapshot = toSnapshot(
      this.id,
      "OTHER",
      units,
      ["geocode", "poi", "transit", "public_web"],
      providers,
      [
        "parcel",
        "costs.property_tax",
        "costs.hoa_or_management_fee",
        "market.currency",
        "market.recent_comparables",
        "risks.flood",
        "risks.earthquake",
        "risks.wildfire",
        "risks.zoning",
      ],
      [
        "Country/market not in US/CA/TW support set — only geocode and nearby POI-level data may apply.",
        "非 US／CA／TW 支援市場：不臆造幣別、稅費或地籍；僅定位與生活機能級資料。",
      ],
      baseLabelsZh(units.feeLabelZh),
    );
    return {
      region: "OTHER",
      jurisdiction,
      jurisdictionKey: jurisdictionKey(jurisdiction),
      adapter: snapshot,
    };
  }
}
