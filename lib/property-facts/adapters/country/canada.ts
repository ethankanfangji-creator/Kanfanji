import type { GeocodeResult } from "../../geocode";
import {
  deriveJurisdiction,
  isBcMetroMunicipality,
  normalizeCaProvince,
} from "../../jurisdiction";
import type { Jurisdiction } from "../../types";
import { BaseCountryAdapter, baseLabelsZh } from "./base";
import type {
  CountryDataTypeId,
  CountryUnits,
  LocalizedReportLabels,
  ProviderSelection,
} from "./types";

export class CanadaAdapter extends BaseCountryAdapter {
  readonly region = "CA" as const;
  readonly id = "CanadaAdapter";

  parseAdmin(geo: GeocodeResult): Jurisdiction {
    const j = deriveJurisdiction({
      region: "CA",
      query: geo.displayAddress || "",
      admin1: normalizeCaProvince(geo.admin1) || geo.admin1,
      city: geo.city,
      county: geo.jurisdiction.county,
      municipality: geo.jurisdiction.municipality || geo.city,
      district: geo.jurisdiction.district,
      houseNumber: geo.streetNumber || geo.jurisdiction.doorplate,
    });
    return {
      ...j,
      admin1: normalizeCaProvince(j.admin1) || j.admin1,
    };
  }

  availableDataTypes(jurisdiction: Jurisdiction): CountryDataTypeId[] {
    const base: CountryDataTypeId[] = [
      "geocode",
      "listing",
      "building",
      "hoa",
      "market",
      "poi",
      "transit",
      "risk",
      "public_web",
    ];
    if (isBcMetroMunicipality(jurisdiction)) {
      return [...base, "parcel", "zoning", "assessment"];
    }
    return base;
  }

  selectProviders(jurisdiction: Jurisdiction): ProviderSelection {
    const metro = isBcMetroMunicipality(jurisdiction);
    const preferred = ["google_maps", "bing_search", "osm_nominatim"];
    const disabled = ["attom", "building_abstract", "mls_crea_ddf"];
    const reasons: Record<string, string> = {
      attom: "ATTOM is US-licensed — not selected for Canada",
      building_abstract: "TW building abstract — not applicable",
      mls_crea_ddf: "CREA DDF requires board membership — stub only; never scrape",
    };
    if (metro) {
      preferred.push("metro_vancouver_open");
    } else {
      disabled.push("metro_vancouver_open");
      reasons.metro_vancouver_open =
        "Metro Vancouver open data only for BC metro municipalities";
    }
    return { preferred, disabled, reasons };
  }

  units(): CountryUnits {
    return {
      area: "sqft",
      currency: "CAD",
      feeLabel: "Strata / Condo fees",
      feeLabelZh: "Strata／Condo 管理費",
    };
  }

  expectedGaps(jurisdiction: Jurisdiction): string[] {
    const gaps = [
      "risks.flood",
      "risks.earthquake",
      "risks.wildfire",
      "market.recent_comparables",
      "costs.insurance_estimate",
      "costs.listing_price",
    ];
    if (!isBcMetroMunicipality(jurisdiction)) {
      gaps.push("parcel", "risks.zoning", "costs.property_tax");
    }
    return gaps;
  }

  legalConstraints(jurisdiction: Jurisdiction): string[] {
    const notices = [
      "Canadian MLS (CREA/board) data requires a licensed DDF agreement — this system does not scrape realtor.ca or board sites.",
      "Strata / Condo documents and Form B require human verification.",
      "Preserve French-language source snippets as originals (do not overwrite with translation).",
      "加拿大 MLS 須經授權；本系統不爬取房仲網站。",
      "Strata／Condo 文件須人工核對正本。",
      "法文來源原文須保留，不得以翻譯覆寫。",
    ];
    if (isBcMetroMunicipality(jurisdiction)) {
      notices.push(
        "Metro Vancouver open data is municipality-scoped and not a substitute for Land Title Office records.",
      );
    }
    return notices;
  }

  localizedReportLabels(): LocalizedReportLabels {
    return baseLabelsZh(this.units().feeLabelZh);
  }
}
