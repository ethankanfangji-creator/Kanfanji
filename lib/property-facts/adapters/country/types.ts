/**
 * Shared types for country-specific adapters (US / CA / TW).
 */

export type CountryDataTypeId =
  | "geocode"
  | "parcel"
  | "assessment"
  | "tax"
  | "listing"
  | "building"
  | "hoa"
  | "zoning"
  | "permits"
  | "market"
  | "poi"
  | "transit"
  | "risk"
  | "public_web";

export type AreaUnit = "sqft" | "m2" | "ping";
export type CurrencyCode = "USD" | "CAD" | "TWD";

export type CountryUnits = {
  area: AreaUnit;
  currency: CurrencyCode;
  /** Display hint for fee fields in reports */
  feeLabel: string;
  feeLabelZh: string;
};

export type ProviderSelection = {
  preferred: string[];
  disabled: string[];
  reasons: Record<string, string>;
};

export type LocalizedReportLabels = {
  locale: "zh-Hant" | "en";
  /** field path → label */
  labels: Record<string, string>;
};

/** Snapshot attached to FactCard / PropertyReport.request.adapter */
export type CountryAdapterSnapshot = {
  id: string;
  region: "US" | "CA" | "TW" | "OTHER";
  units: CountryUnits;
  available_data_types: CountryDataTypeId[];
  providers_preferred: string[];
  providers_disabled: string[];
  provider_reasons: Record<string, string>;
  structural_gaps: string[];
  legal_notices: string[];
  fee_label: string;
  fee_label_zh: string;
  localized_labels: LocalizedReportLabels;
};
