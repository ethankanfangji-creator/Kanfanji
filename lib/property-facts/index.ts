export type {
  AdapterRun,
  AmenityFact,
  ConfidenceLevel,
  CoverageSummary,
  Evidence,
  FieldStatus,
  LaneContext,
  LaneId,
  LaneResult,
  PropertyFactCard,
  PropertyMarket,
  PropertyRegion,
  ProvenancedField,
  RiskFact,
  SourceClass,
  SourceType,
  MatchLevel,
  Jurisdiction,
} from "./types";
export {
  CONFIDENCE_LEVELS,
  FIELD_STATUSES,
  LANE_IDS,
  MATCH_LEVELS,
  PROPERTY_MARKETS,
  PROPERTY_REGIONS,
  SOURCE_CLASSES,
  SOURCE_CLASS_PRIORITY,
  SOURCE_TYPES,
  SOURCE_TYPE_PRIORITY,
} from "./types";

export { assemblePropertyFacts, projectFactCardViaGenerator, generatePropertyReportFromCard } from "./orchestrator";
export type { AssemblePropertyFactsInput } from "./orchestrator";
export type {
  AddressNormalizationService,
  GeocodingProvider,
  CountryAdapter,
  ListingProvider,
  PublicRecordProvider,
  PoiTransitProvider,
  RiskProvider,
  DataNormalizer,
  ConflictResolver,
  EvidenceStore,
  ConfidenceScorer,
  ReportGenerator,
  PropertyFactsPipelineDeps,
} from "./interfaces";
export { createDefaultPipelineDeps } from "./services/defaults";
export { MemoryEvidenceStore, PostgresEvidenceStore } from "./services/evidence-store";
export { normalizeAddressQuery, canonicalizeAddressQuery } from "./normalize-address";
export { resolveFactCard, emptyFactCard } from "./resolve";
export {
  projectFactCardToIntel,
  projectFactCardToBasics,
  factCardPromptPayload,
} from "./project";
export { projectFactCardToReport } from "./report";
export { buildReportNarrative, detectSnippetLanguage } from "./narrative";
export { buildReportCompliance } from "./compliance";
export {
  assertCitations,
  extractEvidenceIds,
  sanitizeCitedStrings,
} from "./citations";
export { gateProvider, resolveProviderAvailability } from "./providers/registry";
export type {
  PropertyReport,
  ReportEvidenceItem,
  ReportClaimable,
  ReportLocationItem,
  ReportMatch,
  ReportNarrative,
  ReportSourceSnippet,
  ReportCompliance,
} from "./report-types";
export {
  PROPERTY_REPORT_DISCLAIMER,
  PROPERTY_REPORT_DISCLAIMER_ZH,
  REPORT_SECTION_CATALOG,
} from "./report-types";
export type { ReportSectionId } from "./report-types";
export { buildAddressMatch } from "./match";
export { enrichAmenityDistances } from "./distance";
export { scoreConfidence } from "./confidence";
export {
  compareEvidence,
  decideEvidenceWinner,
  isEstimatedSource,
  MATCH_LEVEL_PRIORITY,
} from "./conflict-policy";
export { deriveJurisdiction, jurisdictionKey, isBcMetroMunicipality } from "./jurisdiction";
export {
  UnitedStatesAdapter,
  CanadaAdapter,
  TaiwanAdapter,
  OtherCountryAdapter,
  selectCountryAdapter,
  resolveWithCountryAdapter,
} from "./adapters/country/registry";
export type { CountryAdapterSnapshot } from "./adapters/country/types";
export {
  makeEvidence,
  notFoundField,
  needsHumanField,
  foundField,
  conflictField,
} from "./evidence";
