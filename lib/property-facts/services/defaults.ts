/**
 * Default wiring for the property-facts pipeline (option A).
 * Vendor SDKs stay behind geocode / lane modules — orchestrator imports this only.
 */

import type { PropertyFactsPipelineDeps } from "../interfaces";
import { DefaultAddressNormalizationService } from "./address-normalization";
import { DefaultGeocodingProvider } from "./geocoding";
import { DefaultCountryAdapter } from "./country-adapter";
import { DefaultDataNormalizer } from "./data-normalizer";
import { DefaultConflictResolver } from "./conflict-resolver";
import { DefaultConfidenceScorer } from "./confidence-scorer";
import { DefaultReportGenerator } from "./report-generator";
import { createDefaultEvidenceStore } from "./evidence-store";
import { DefaultListingProvider } from "../providers/listing/default";
import { DefaultPublicRecordProvider } from "../providers/public-record/default";
import { DefaultPoiTransitProvider } from "../providers/poi-transit/default";
import { DefaultRiskProvider } from "../providers/risk/default";

export function createDefaultPipelineDeps(
  overrides?: Partial<PropertyFactsPipelineDeps>,
): PropertyFactsPipelineDeps {
  return {
    addressNormalization: new DefaultAddressNormalizationService(),
    geocoding: new DefaultGeocodingProvider(),
    countryAdapter: new DefaultCountryAdapter(),
    listing: new DefaultListingProvider(),
    publicRecord: new DefaultPublicRecordProvider(),
    poiTransit: new DefaultPoiTransitProvider(),
    risk: new DefaultRiskProvider(),
    dataNormalizer: new DefaultDataNormalizer(),
    conflictResolver: new DefaultConflictResolver(),
    evidenceStore: createDefaultEvidenceStore(),
    confidenceScorer: new DefaultConfidenceScorer(),
    reportGenerator: new DefaultReportGenerator(),
    ...overrides,
  };
}
