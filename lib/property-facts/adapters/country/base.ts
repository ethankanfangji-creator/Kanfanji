import type { GeocodeResult } from "../../geocode";
import { jurisdictionKey } from "../../jurisdiction";
import type { CountryAdapter, CountryResolution } from "../../interfaces";
import type { Jurisdiction, PropertyRegion } from "../../types";
import type {
  CountryAdapterSnapshot,
  CountryDataTypeId,
  CountryUnits,
  LocalizedReportLabels,
  ProviderSelection,
} from "./types";

export function baseLabelsZh(fee: string): LocalizedReportLabels {
  return {
    locale: "zh-Hant",
    labels: {
      "property.building_area": "建物面積",
      "property.lot_area": "土地面積",
      "property.year_built": "建造年份",
      "costs.property_tax": "稅費",
      "costs.hoa_or_management_fee": fee,
      "market.currency": "幣別",
      "risks.zoning": "分區／使用分區",
      "risks.permit_or_violation": "建照／違規",
    },
  };
}

export function toSnapshot(
  id: string,
  region: PropertyRegion,
  units: CountryUnits,
  dataTypes: CountryDataTypeId[],
  providers: ProviderSelection,
  structuralGaps: string[],
  legalNotices: string[],
  localized: LocalizedReportLabels,
): CountryAdapterSnapshot {
  const r =
    region === "US" || region === "CA" || region === "TW" ? region : "OTHER";
  return {
    id,
    region: r,
    units,
    available_data_types: dataTypes,
    providers_preferred: providers.preferred,
    providers_disabled: providers.disabled,
    provider_reasons: providers.reasons,
    structural_gaps: structuralGaps,
    legal_notices: legalNotices,
    fee_label: units.feeLabel,
    fee_label_zh: units.feeLabelZh,
    localized_labels: localized,
  };
}

export abstract class BaseCountryAdapter implements CountryAdapter {
  abstract readonly region: "US" | "CA" | "TW";
  abstract readonly id: string;

  abstract parseAdmin(geo: GeocodeResult): Jurisdiction;
  abstract availableDataTypes(jurisdiction: Jurisdiction): CountryDataTypeId[];
  abstract selectProviders(jurisdiction: Jurisdiction): ProviderSelection;
  abstract units(): CountryUnits;
  abstract expectedGaps(jurisdiction: Jurisdiction): string[];
  abstract legalConstraints(jurisdiction: Jurisdiction): string[];
  abstract localizedReportLabels(): LocalizedReportLabels;

  resolve(geo: GeocodeResult): CountryResolution {
    const jurisdiction = this.parseAdmin(geo);
    const providers = this.selectProviders(jurisdiction);
    const units = this.units();
    const snapshot = toSnapshot(
      this.id,
      this.region,
      units,
      this.availableDataTypes(jurisdiction),
      providers,
      this.expectedGaps(jurisdiction),
      this.legalConstraints(jurisdiction),
      this.localizedReportLabels(),
    );
    return {
      region: this.region,
      jurisdiction,
      jurisdictionKey: jurisdictionKey(jurisdiction),
      adapter: snapshot,
    };
  }

  convertArea(
    value: number,
    fromUnit: string,
  ): { value: number; unit: string } | null {
    const target = this.units().area;
    if (!Number.isFinite(value)) return null;
    if (fromUnit === target) return { value, unit: target };
    return null;
  }
}
