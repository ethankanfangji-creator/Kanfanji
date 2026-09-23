/**
 * Module-boundary interfaces for the property-facts pipeline.
 * Implementations live under services/ and providers/{listing,public-record,poi-transit,risk}/.
 * Redis / PostGIS backends are reserved — not required for the default stack.
 */

import type { GeocodeResult } from "./geocode";
import type { CountryAdapterSnapshot } from "./adapters/country/types";
import type {
  Evidence,
  Jurisdiction,
  LaneContext,
  LaneResult,
  PropertyFactCard,
  PropertyRegion,
} from "./types";
import type { PropertyReport } from "./report-types";
import type { ProviderAudit } from "./providers/types";

// —— Address normalization ——

export type NormalizedAddress = {
  rawAddress: string;
  normalizedQuery: string;
  unitHint: string | null;
};

export interface AddressNormalizationService {
  normalize(raw: string): NormalizedAddress;
}

// —— Geocoding ——

export interface GeocodingProvider {
  geocode(
    normalizedQuery: string,
    opts?: { audit?: ProviderAudit },
  ): Promise<GeocodeResult>;
}

// —— Country adapter ——

export type CountryResolution = {
  region: PropertyRegion;
  jurisdiction: Jurisdiction;
  jurisdictionKey: string;
  /** Full national adapter snapshot (units, providers, legal, labels). */
  adapter: CountryAdapterSnapshot;
};

export interface CountryAdapter {
  readonly id?: string;
  readonly region?: PropertyRegion;
  resolve(geo: GeocodeResult): CountryResolution;
  parseAdmin?(geo: GeocodeResult): Jurisdiction;
  availableDataTypes?(jurisdiction: Jurisdiction): string[];
  selectProviders?(jurisdiction: Jurisdiction): {
    preferred: string[];
    disabled: string[];
    reasons: Record<string, string>;
  };
  units?(): {
    area: string;
    currency: string;
    feeLabel: string;
    feeLabelZh: string;
  };
  expectedGaps?(jurisdiction: Jurisdiction): string[];
  legalConstraints?(jurisdiction: Jurisdiction): string[];
  localizedReportLabels?(): {
    locale: "zh-Hant" | "en";
    labels: Record<string, string>;
  };
  convertArea?(
    value: number,
    fromUnit: string,
  ): { value: number; unit: string } | null;
}

// —— Domain providers (licensed / official APIs only; no scraping) ——

export interface PropertyDataProviderPort {
  readonly id: string;
}

export interface ListingProvider extends PropertyDataProviderPort {
  fetchListing(ctx: LaneContext): Promise<LaneResult>;
  fetchBuilding(ctx: LaneContext): Promise<LaneResult>;
  fetchHoa(ctx: LaneContext): Promise<LaneResult>;
  fetchMarket(ctx: LaneContext): Promise<LaneResult>;
}

export interface PublicRecordProvider extends PropertyDataProviderPort {
  fetchParcel(ctx: LaneContext): Promise<LaneResult>;
  fetchZoning(ctx: LaneContext): Promise<LaneResult>;
}

export interface PoiTransitProvider extends PropertyDataProviderPort {
  fetchPoi(ctx: LaneContext): Promise<LaneResult>;
  fetchTransit(ctx: LaneContext): Promise<LaneResult>;
  fetchPublicWeb(ctx: LaneContext): Promise<Evidence<string>[]>;
}

export interface RiskProvider extends PropertyDataProviderPort {
  fetchRisk(ctx: LaneContext): Promise<LaneResult>;
}

// —— Pipeline services ——

export interface DataNormalizer {
  /** Normalize / sanitize evidence before conflict resolution (no invention). */
  normalizeEvidence(evidence: Evidence<unknown>[]): Evidence<unknown>[];
}

export interface ConflictResolver {
  resolve(input: {
    rawAddress: string;
    region: PropertyRegion;
    identityEvidence: Evidence<unknown>[];
    laneEvidence: Evidence<unknown>[];
    publicWebEvidence: Evidence<string>[];
    adapterRuns: import("./types").AdapterRun[];
    geocodeOk: boolean;
    jurisdictionKey?: string | null;
    assembledAt?: string;
    providersUsed?: Array<{ id: string; kind: string; auth_scope: string }>;
    providersSkipped?: Array<{ id: string; reason: string }>;
    countryAdapter?: import("./adapters/country/types").CountryAdapterSnapshot | null;
  }): PropertyFactCard;
}

export interface EvidenceStore {
  get(normalizedQuery: string): Promise<PropertyFactCard | null>;
  set(normalizedQuery: string, card: PropertyFactCard): Promise<void>;
}

/** Reserved — not wired in default pipeline (use Postgres cache instead). */
export interface RedisEvidenceStore extends EvidenceStore {
  readonly backend: "redis";
}

export interface ConfidenceScorer {
  score(input: {
    sourceType: import("./types").SourceType;
    matchLevel: import("./types").MatchLevel;
    retrievedAt: string;
    effectiveDate?: string | null;
    conflict?: boolean;
    now?: number;
  }): number;
}

export interface ReportGenerator {
  fromFactCard(card: PropertyFactCard): PropertyReport;
}

/** Injectable pipeline dependencies for assemblePropertyFacts. */
export type PropertyFactsPipelineDeps = {
  addressNormalization: AddressNormalizationService;
  geocoding: GeocodingProvider;
  countryAdapter: CountryAdapter;
  listing: ListingProvider;
  publicRecord: PublicRecordProvider;
  poiTransit: PoiTransitProvider;
  risk: RiskProvider;
  dataNormalizer: DataNormalizer;
  conflictResolver: ConflictResolver;
  evidenceStore: EvidenceStore;
  confidenceScorer: ConfidenceScorer;
  reportGenerator: ReportGenerator;
};
