/**
 * Multi-country property facts layer (US / CA / TW).
 * Real fields come from adapters only — LLM never invents fact values.
 */

export const SOURCE_CLASSES = [
  "official",
  "licensed",
  "crawl_service",
  "public_web",
  "user",
  "model_estimate",
] as const;
export type SourceClass = (typeof SOURCE_CLASSES)[number];

/**
 * Finer source vocabulary. Precedence is by source type, not country.
 * listing_claim / area_statistic / model_estimate never become confirmed facts.
 */
export const SOURCE_TYPES = [
  "official",
  "public_record",
  "licensed_vendor",
  "licensed_listing",
  "crawl_service",
  "public_web",
  "listing_claim",
  "area_statistic",
  "user",
  "model_estimate",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** Lower index wins. Claims and estimates never outrank records. */
export const SOURCE_TYPE_PRIORITY: Record<SourceType, number> = {
  official: 0,
  public_record: 1,
  licensed_vendor: 2,
  licensed_listing: 3,
  crawl_service: 4,
  public_web: 5,
  listing_claim: 6,
  area_statistic: 7,
  user: 8,
  model_estimate: 9,
};

/** Merge precedence: lower index wins. model_estimate never wins a found fact. */
export const SOURCE_CLASS_PRIORITY: Record<SourceClass, number> = {
  official: 0,
  licensed: 1,
  crawl_service: 2,
  public_web: 3,
  user: 4,
  model_estimate: 5,
};

export const MATCH_LEVELS = [
  "exact_unit",
  "exact_parcel",
  "street",
  "neighborhood",
  "inferred",
] as const;
export type MatchLevel = (typeof MATCH_LEVELS)[number];

export function sourceClassOf(sourceType: SourceType): SourceClass {
  switch (sourceType) {
    case "official":
    case "public_record":
      return "official";
    case "licensed_vendor":
    case "licensed_listing":
      return "licensed";
    case "crawl_service":
      return "crawl_service";
    case "user":
      return "user";
    case "model_estimate":
      return "model_estimate";
    default:
      return "public_web";
  }
}

export function defaultSourceType(sourceClass: SourceClass): SourceType {
  switch (sourceClass) {
    case "official":
      return "official";
    case "licensed":
      return "licensed_vendor";
    case "crawl_service":
      return "crawl_service";
    case "user":
      return "user";
    case "model_estimate":
      return "model_estimate";
    default:
      return "public_web";
  }
}

export const FIELD_STATUSES = ["found", "not_found", "needs_human", "expired"] as const;
export type FieldStatus = (typeof FIELD_STATUSES)[number];

export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const LANE_IDS = [
  "listing",
  "parcel",
  "building",
  "hoa",
  "zoning",
  "poi",
  "transit",
  "risk",
  "market",
] as const;
export type LaneId = (typeof LANE_IDS)[number];

export const PROPERTY_REGIONS = ["CA", "US", "TW", "OTHER"] as const;
export type PropertyRegion = (typeof PROPERTY_REGIONS)[number];

/** Viewing / AI markets include TH (locale product); property region does not. */
export const PROPERTY_MARKETS = ["CA", "US", "TW", "TH", "OTHER"] as const;
export type PropertyMarket = (typeof PROPERTY_MARKETS)[number];

export type Evidence<T> = {
  lane: LaneId;
  field: string;
  value: T;
  unit: string | null;
  sourceType: SourceType;
  sourceClass: SourceClass;
  sourceId: string;
  sourceName: string;
  sourceLabel: string;
  sourceUrl: string | null;
  retrievedAt: string;
  fetchedAt: string;
  effectiveDate: string | null;
  expiresAt: string;
  matchLevel: MatchLevel;
  /** Scorer output 0–1. Adapters do not assign the final score. */
  confidence: number | null;
  evidence: string | null;
  limitations: string | null;
  /** @deprecated Prefer sourceType. Kept so older callers still compile. */
  confidenceHint?: ConfidenceLevel;
  rawRef?: string;
};

export type ProvenancedField<T> = {
  status: FieldStatus;
  value: T | null;
  unit: string | null;
  sourceType: SourceType | null;
  sourceClass: SourceClass | null;
  sourceId: string | null;
  sourceName: string | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  retrievedAt: string | null;
  fetchedAt: string | null;
  effectiveDate: string | null;
  expiresAt: string | null;
  matchLevel: MatchLevel | null;
  /** 0–1 from the scorer, or null when there is no value. */
  confidence: number | null;
  evidence: string | null;
  limitations: string | null;
  conflicts?: Evidence<T>[];
  rawRef?: string | null;
};

/** Administrative slice used to pick a lane adapter. Not a national feed. */
export type Jurisdiction = {
  region: PropertyRegion;
  /** US state, CA province, TW 縣市 */
  admin1: string | null;
  /** US county; otherwise null */
  county: string | null;
  city: string | null;
  /** CA municipality when distinct from city */
  municipality: string | null;
  /** TW 行政區 */
  district: string | null;
  /** TW 地段 */
  section: string | null;
  /** TW 門牌 */
  doorplate: string | null;
};

export type AmenityFact = {
  kind: string;
  name: string;
  minutesWalk: number | null;
};

export type RiskFact = {
  code: string;
  label: string;
};

export type PropertyFactIdentity = {
  rawAddress: string;
  normalizedAddress: ProvenancedField<string>;
  displayAddress: ProvenancedField<string>;
  countryCode: ProvenancedField<string>;
  admin1: ProvenancedField<string>;
  county: ProvenancedField<string>;
  city: ProvenancedField<string>;
  municipality: ProvenancedField<string>;
  district: ProvenancedField<string>;
  section: ProvenancedField<string>;
  doorplate: ProvenancedField<string>;
  postalCode: ProvenancedField<string>;
  lat: ProvenancedField<number>;
  lng: ProvenancedField<number>;
  unitHint: ProvenancedField<string>;
};

export type PropertyFactListing = {
  propertyType: ProvenancedField<string>;
  beds: ProvenancedField<number>;
  baths: ProvenancedField<number>;
  area: ProvenancedField<number>;
  listingUrl: ProvenancedField<string>;
  notes: ProvenancedField<string[]>;
};

export type PropertyFactParcel = {
  parcelId: ProvenancedField<string>;
  pid: ProvenancedField<string>;
  planNumber: ProvenancedField<string>;
  lotNumber: ProvenancedField<string>;
  rollNumber: ProvenancedField<string>;
  legalDescription: ProvenancedField<string>;
  assessedValue: ProvenancedField<string>;
  propertyTax: ProvenancedField<string>;
};

export type PropertyFactBuilding = {
  yearBuilt: ProvenancedField<number>;
  buildingType: ProvenancedField<string>;
  permits: ProvenancedField<string[]>;
  inspections: ProvenancedField<string[]>;
};

export type PropertyFactHoa = {
  managementFee: ProvenancedField<string>;
  strataFee: ProvenancedField<string>;
  hoaName: ProvenancedField<string>;
};

export type PropertyFactZoning = {
  zoningCode: ProvenancedField<string>;
  zoningLabel: ProvenancedField<string>;
  zoningCategory: ProvenancedField<string>;
  landUse: ProvenancedField<string>;
  covenantHint: ProvenancedField<boolean>;
  easementHint: ProvenancedField<boolean>;
};

export type PropertyFactPoi = {
  schools: ProvenancedField<string[]>;
  supermarket: ProvenancedField<string>;
  park: ProvenancedField<string>;
  hospital: ProvenancedField<string>;
  amenities: ProvenancedField<AmenityFact[]>;
};

export type PropertyFactTransit = {
  rail: ProvenancedField<string>;
  bus: ProvenancedField<string>;
};

export type PropertyFactRisk = {
  items: ProvenancedField<RiskFact[]>;
  noiseNote: ProvenancedField<string>;
};

export type PropertyFactMarket = {
  currency: ProvenancedField<string>;
  lastSold: ProvenancedField<string>;
  avgUnitPrice: ProvenancedField<string>;
  priceRange: ProvenancedField<string>;
  rentHint: ProvenancedField<string>;
};

export type AdapterRun = {
  lane: LaneId;
  sourceId: string;
  ok: boolean;
  error?: string;
  durationMs: number;
};

export type CoverageSummary = {
  found: number;
  notFound: number;
  needsHuman: number;
  expired: number;
};

export type PropertyFactCard = {
  region: PropertyRegion;
  identity: PropertyFactIdentity;
  listing: PropertyFactListing;
  parcel: PropertyFactParcel;
  building: PropertyFactBuilding;
  hoa: PropertyFactHoa;
  zoning: PropertyFactZoning;
  poi: PropertyFactPoi;
  transit: PropertyFactTransit;
  risk: PropertyFactRisk;
  market: PropertyFactMarket;
  meta: {
    assembledAt: string;
    adapterRuns: AdapterRun[];
    coverageSummary: CoverageSummary;
    evidenceCount: number;
    geocodeOk: boolean;
    /** Adapter routing key, e.g. us:wa:king:seattle */
    jurisdictionKey: string | null;
  };
  /** Public-web snippets kept as evidence only (never auto-promoted to found facts). */
  publicWebEvidence: Evidence<string>[];
};

export type LaneContext = {
  rawAddress: string;
  normalizedQuery: string;
  region: PropertyRegion;
  displayAddress: string | null;
  countryCode: string | null;
  admin1: string | null;
  city: string | null;
  postalCode: string | null;
  jurisdiction: Jurisdiction;
  jurisdictionKey: string;
  lat: number | null;
  lng: number | null;
  now: string;
};

export type LaneResult = {
  lane: LaneId;
  evidence: Evidence<unknown>[];
  runs: AdapterRun[];
};
