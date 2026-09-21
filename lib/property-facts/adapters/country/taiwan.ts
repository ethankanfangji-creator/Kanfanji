import type { GeocodeResult } from "../../geocode";
import { deriveJurisdiction } from "../../jurisdiction";
import type { Jurisdiction } from "../../types";
import { BaseCountryAdapter, baseLabelsZh } from "./base";
import type {
  CountryDataTypeId,
  CountryUnits,
  LocalizedReportLabels,
  ProviderSelection,
} from "./types";

export class TaiwanAdapter extends BaseCountryAdapter {
  readonly region = "TW" as const;
  readonly id = "TaiwanAdapter";

  parseAdmin(geo: GeocodeResult): Jurisdiction {
    return deriveJurisdiction({
      region: "TW",
      query: geo.displayAddress || "",
      admin1: geo.admin1 || geo.city,
      city: geo.city,
      county: geo.jurisdiction.county,
      municipality: geo.jurisdiction.municipality,
      district: geo.jurisdiction.district,
      section: geo.jurisdiction.section,
      houseNumber: geo.streetNumber || geo.jurisdiction.doorplate,
    });
  }

  availableDataTypes(_jurisdiction: Jurisdiction): CountryDataTypeId[] {
    return [
      "geocode",
      "listing",
      "building",
      "hoa",
      "market",
      "poi",
      "transit",
      "risk",
      "public_web",
      "parcel",
      "permits",
      "tax",
    ];
  }

  selectProviders(_jurisdiction: Jurisdiction): ProviderSelection {
    return {
      preferred: ["google_maps", "bing_search", "osm_nominatim"],
      disabled: ["attom", "metro_vancouver_open", "mls_crea_ddf"],
      reasons: {
        attom: "ATTOM is US-licensed — not selected for Taiwan",
        metro_vancouver_open: "Canada open data — not applicable",
        mls_crea_ddf: "Canadian MLS — not applicable",
        building_abstract:
          "建物謄本需官方通路或使用者上傳正本 — stub；禁止爬取",
        hoa_condo_docs: "管理費／規約需使用者上傳或人工驗證 — stub",
      },
    };
  }

  units(): CountryUnits {
    return {
      area: "ping",
      currency: "TWD",
      feeLabel: "Management fee (管理費)",
      feeLabelZh: "管理費",
    };
  }

  expectedGaps(_jurisdiction: Jurisdiction): string[] {
    return [
      "parcel",
      "risks.permit_or_violation",
      "costs.property_tax",
      "market.recent_comparables",
      "costs.listing_price",
      "risks.flood",
      "risks.earthquake",
      "risks.wildfire",
    ];
  }

  legalConstraints(_jurisdiction: Jurisdiction): string[] {
    return [
      "台灣建物謄本、地籍與實價登錄須經官方授權 API 或人工上傳正本；本系統不爬取政府或房仲網站。",
      "管理費與規約需人工核對管委會／管理中心文件。",
      "Building abstracts, cadastre, and official transaction records require licensed APIs or human-uploaded certified copies — never scrape.",
      "Management fees require human verification of building-management documents.",
    ];
  }

  localizedReportLabels(): LocalizedReportLabels {
    const labels = baseLabelsZh(this.units().feeLabelZh);
    return {
      ...labels,
      labels: {
        ...labels.labels,
        "property.building_area": "建物面積（坪）",
        "property.lot_area": "土地面積",
        "costs.property_tax": "房屋稅／地價稅相關",
      },
    };
  }
}
