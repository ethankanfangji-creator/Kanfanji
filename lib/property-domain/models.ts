/**
 * Canonical property-domain models (US / CA / TW).
 * Important fields use ProvenancedValue — no invented bare numbers.
 */

import type { ProvenancedValue } from "./provenance";

export const DOMAIN_SCHEMA_VERSION = "property-domain/v1" as const;

export type AddressComponents = {
  streetNumber: ProvenancedValue<string>;
  streetName: ProvenancedValue<string>;
  city: ProvenancedValue<string>;
  admin1: ProvenancedValue<string>;
  county: ProvenancedValue<string>;
  district: ProvenancedValue<string>;
  section: ProvenancedValue<string>;
  doorplate: ProvenancedValue<string>;
  postalCode: ProvenancedValue<string>;
  country: ProvenancedValue<string>;
};

export type Address = {
  input: string;
  normalized: ProvenancedValue<string>;
  display: ProvenancedValue<string>;
  components: AddressComponents;
  placeId: ProvenancedValue<string>;
  jurisdictionKey: ProvenancedValue<string>;
  unitHint: ProvenancedValue<string>;
};

export type GeocodingResult = {
  lat: ProvenancedValue<number>;
  lng: ProvenancedValue<number>;
  provider: ProvenancedValue<string>;
  matchLevel: ProvenancedValue<string>;
  displayAddress: ProvenancedValue<string>;
  geocodeOk: boolean;
};

export type Property = {
  propertyType: ProvenancedValue<string>;
  yearBuilt: ProvenancedValue<number>;
  buildingArea: ProvenancedValue<number>;
  lotArea: ProvenancedValue<number>;
  bedrooms: ProvenancedValue<number>;
  bathrooms: ProvenancedValue<number>;
  parking: ProvenancedValue<string>;
  condition: ProvenancedValue<string>;
  parcelId: ProvenancedValue<string>;
  buildingId: ProvenancedValue<string>;
};

export type Listing = {
  listingId: ProvenancedValue<string>;
  price: ProvenancedValue<string>;
  status: ProvenancedValue<string>;
  propertyType: ProvenancedValue<string>;
  bedrooms: ProvenancedValue<number>;
  bathrooms: ProvenancedValue<number>;
  area: ProvenancedValue<number>;
  currency: ProvenancedValue<string>;
};

export type Transaction = {
  soldPrice: ProvenancedValue<string>;
  soldDate: ProvenancedValue<string>;
  instrument: ProvenancedValue<string>;
  currency: ProvenancedValue<string>;
};

export type BuildingPermit = {
  permitId: ProvenancedValue<string>;
  permitType: ProvenancedValue<string>;
  status: ProvenancedValue<string>;
  issuedAt: ProvenancedValue<string>;
  summary: ProvenancedValue<string>;
};

export type Assessment = {
  assessedValue: ProvenancedValue<string>;
  assessedYear: ProvenancedValue<string>;
  rollNumber: ProvenancedValue<string>;
  currency: ProvenancedValue<string>;
};

export type TaxRecord = {
  amount: ProvenancedValue<string>;
  taxYear: ProvenancedValue<string>;
  jurisdiction: ProvenancedValue<string>;
  currency: ProvenancedValue<string>;
};

export type HOAOrManagementFee = {
  amount: ProvenancedValue<string>;
  period: ProvenancedValue<string>;
  feeKind: ProvenancedValue<"hoa" | "strata" | "condo" | "management" | "other">;
  currency: ProvenancedValue<string>;
};

export type ZoningRecord = {
  code: ProvenancedValue<string>;
  label: ProvenancedValue<string>;
  landUse: ProvenancedValue<string>;
};

export type NearbyPlace = {
  name: ProvenancedValue<string>;
  kind: ProvenancedValue<string>;
  straightLineMeters: ProvenancedValue<number>;
  walkingMinutes: ProvenancedValue<number>;
  drivingMinutes: ProvenancedValue<number>;
  peakDrivingMinutes: ProvenancedValue<number>;
};

export type TransitStop = {
  name: ProvenancedValue<string>;
  mode: ProvenancedValue<string>;
  straightLineMeters: ProvenancedValue<number>;
  walkingMinutes: ProvenancedValue<number>;
  drivingMinutes: ProvenancedValue<number>;
};

export type MarketComparable = {
  address: ProvenancedValue<string>;
  price: ProvenancedValue<string>;
  soldDate: ProvenancedValue<string>;
  distanceMeters: ProvenancedValue<number>;
  currency: ProvenancedValue<string>;
};

export type RiskRecord = {
  kind: ProvenancedValue<"flood" | "earthquake" | "wildfire" | "noise" | "other">;
  levelOrNote: ProvenancedValue<string>;
};

export type Evidence = {
  id: string;
  field: string;
  value: unknown;
  unit: string | null;
  source: string | null;
  sourceUrl: string | null;
  retrievedAt: string | null;
  effectiveDate: string | null;
  confidence: number | null;
  evidence: string | null;
  limitations: string | null;
  status: "found" | "needs_human" | "conflict";
  matchLevel: string | null;
};

export type DataGap = {
  fieldPath: string;
  reason:
    | "not_found"
    | "needs_human"
    | "expired"
    | "out_of_jurisdiction"
    | "provider_unavailable"
    | "conflict";
  note: string | null;
};

export type DomainCountryAdapter = {
  id: string;
  units: { area: string; currency: string };
  availableDataTypes: string[];
  providersPreferred: string[];
  providersDisabled: string[];
  structuralGaps: string[];
  legalNotices: string[];
  feeLabel: string;
  feeLabelZh: string;
};

export type DomainPropertyReport = {
  schemaVersion: typeof DOMAIN_SCHEMA_VERSION;
  address: Address;
  geocoding: GeocodingResult;
  property: Property;
  listing: Listing;
  transactions: Transaction[];
  permits: BuildingPermit[];
  assessment: Assessment;
  tax: TaxRecord;
  hoa: HOAOrManagementFee;
  zoning: ZoningRecord;
  nearby: NearbyPlace[];
  transit: TransitStop[];
  comparables: MarketComparable[];
  risks: RiskRecord[];
  evidence: Evidence[];
  dataGaps: DataGap[];
  adapter: DomainCountryAdapter | null;
  disclaimer: string;
  narrativeSummaryZh: string | null;
};
