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

export class UnitedStatesAdapter extends BaseCountryAdapter {
  readonly region = "US" as const;
  readonly id = "UnitedStatesAdapter";

  parseAdmin(geo: GeocodeResult): Jurisdiction {
    return deriveJurisdiction({
      region: "US",
      query: geo.displayAddress || "",
      admin1: geo.admin1,
      city: geo.city,
      county: geo.jurisdiction.county,
      municipality: geo.jurisdiction.municipality,
      district: geo.jurisdiction.district,
      houseNumber: geo.streetNumber || geo.jurisdiction.doorplate,
    });
  }

  availableDataTypes(_jurisdiction: Jurisdiction): CountryDataTypeId[] {
    return [
      "geocode",
      "parcel",
      "assessment",
      "tax",
      "listing",
      "building",
      "hoa",
      "zoning",
      "market",
      "poi",
      "transit",
      "risk",
      "public_web",
    ];
  }

  selectProviders(_jurisdiction: Jurisdiction): ProviderSelection {
    return {
      preferred: ["google_maps", "attom", "bing_search", "osm_nominatim"],
      disabled: ["metro_vancouver_open", "mls_crea_ddf", "building_abstract"],
      reasons: {
        metro_vancouver_open: "US jurisdiction — Metro Vancouver open data N/A",
        mls_crea_ddf: "Canadian MLS — not applicable",
        building_abstract: "TW building abstract — not applicable",
        mls: "US MLS requires a licensed feed — stub only; never scrape",
      },
    };
  }

  units(): CountryUnits {
    return {
      area: "sqft",
      currency: "USD",
      feeLabel: "HOA / Condo fee",
      feeLabelZh: "HOA／Condo 管理費",
    };
  }

  expectedGaps(_jurisdiction: Jurisdiction): string[] {
    return [
      "risks.flood",
      "risks.earthquake",
      "risks.wildfire",
      "market.recent_comparables",
      "costs.insurance_estimate",
      "costs.special_assessment",
    ];
  }

  legalConstraints(_jurisdiction: Jurisdiction): string[] {
    return [
      "US listings are not confirmed without a licensed MLS/broker API — this system does not scrape realtor sites.",
      "County assessor and city permit data vary by jurisdiction; ATTOM (when keyed) is a licensed vendor, not the assessor of record.",
      "HOA / Condo governing documents require human verification of originals.",
      "美國掛牌未經授權 MLS／房仲 API 不得視為確認；本系統不爬取房仲網站。",
      "HOA／Condo 文件須人工核對正本。",
    ];
  }

  localizedReportLabels(): LocalizedReportLabels {
    return baseLabelsZh(this.units().feeLabelZh);
  }
}
