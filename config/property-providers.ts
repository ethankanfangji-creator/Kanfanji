/**
 * Declarative property-data provider catalogue (no secrets).
 * Secrets live in env vars named by `envKeyName`.
 * `allowsScraping` MUST always be false — loaders reject any true entry.
 */

export type ProviderKind =
  | "official"
  | "licensed_api"
  | "open_data"
  | "search_api"
  | "user_upload"
  | "geocode";

export type ProviderComplianceTag =
  | "mls"
  | "broker"
  | "cadastre"
  | "building_abstract"
  | "hoa_condo"
  | "tax"
  | "risk"
  | "poi";

export type PropertyProviderDef = {
  id: string;
  kind: ProviderKind;
  label: string;
  regions: Array<"US" | "CA" | "TW" | "OTHER">;
  lanes: string[];
  /** Env var holding the API key/secret; null = no key required (open data / upload). */
  envKeyName: string | null;
  authScope: string;
  rateLimit: { rpm: number; daily?: number };
  retentionHours: number;
  /** Hard rule: scrapers are forbidden. Must be false. */
  allowsScraping: false;
  complianceTags: ProviderComplianceTag[];
  humanVerificationRequired: boolean;
  enabledByDefault: boolean;
  /** Reserved / not wired — stays skipped until a licensed adapter exists. */
  stubOnly?: boolean;
};

export const PROPERTY_PROVIDER_DEFS: PropertyProviderDef[] = [
  {
    id: "google_maps",
    kind: "geocode",
    label: "Google Maps Platform",
    regions: ["US", "CA", "TW", "OTHER"],
    lanes: ["listing", "poi", "transit"],
    envKeyName: "GOOGLE_MAPS_API_KEY",
    authScope: "Geocoding, Places Nearby, Distance Matrix, Street View per Google Maps ToS",
    rateLimit: { rpm: 60, daily: 5000 },
    retentionHours: 168,
    allowsScraping: false,
    complianceTags: ["poi"],
    humanVerificationRequired: false,
    enabledByDefault: true,
  },
  {
    id: "bing_search",
    kind: "search_api",
    label: "Bing Web Search",
    regions: ["US", "CA", "TW", "OTHER"],
    lanes: ["listing"],
    envKeyName: "BING_SEARCH_API_KEY",
    authScope: "Search snippets only — not a listing or official record feed",
    rateLimit: { rpm: 30, daily: 1000 },
    retentionHours: 24,
    allowsScraping: false,
    complianceTags: ["broker"],
    humanVerificationRequired: true,
    enabledByDefault: true,
  },
  {
    id: "attom",
    kind: "licensed_api",
    label: "ATTOM Data",
    regions: ["US"],
    lanes: ["listing", "parcel", "building", "market"],
    envKeyName: "ATTOM_API_KEY",
    authScope: "Licensed US property profile API — redisplay rules follow vendor contract",
    rateLimit: { rpm: 30, daily: 2000 },
    retentionHours: 168,
    allowsScraping: false,
    complianceTags: ["cadastre", "tax", "broker"],
    humanVerificationRequired: true,
    enabledByDefault: true,
  },
  {
    id: "metro_vancouver_open",
    kind: "open_data",
    label: "Metro Vancouver Open Data",
    regions: ["CA"],
    lanes: ["parcel", "zoning"],
    envKeyName: null,
    authScope: "Public open data for Metro Vancouver municipalities only",
    rateLimit: { rpm: 30, daily: 2000 },
    retentionHours: 168,
    allowsScraping: false,
    complianceTags: ["cadastre"],
    humanVerificationRequired: true,
    enabledByDefault: true,
  },
  {
    id: "osm_nominatim",
    kind: "open_data",
    label: "OpenStreetMap Nominatim / local geocoders",
    regions: ["US", "CA", "TW", "OTHER"],
    lanes: ["listing"],
    envKeyName: null,
    authScope: "Geocode / display name under OSM / local geocoder usage policies",
    rateLimit: { rpm: 60, daily: 5000 },
    retentionHours: 168,
    allowsScraping: false,
    complianceTags: [],
    humanVerificationRequired: false,
    enabledByDefault: true,
  },
  // —— Reserved: require formal license before enabling ——
  {
    id: "mls_crea_ddf",
    kind: "licensed_api",
    label: "CREA DDF (MLS)",
    regions: ["CA"],
    lanes: ["listing", "market"],
    envKeyName: "CREA_DDF_CLIENT_SECRET",
    authScope: "Requires CREA/board membership and DDF agreement — not wired",
    rateLimit: { rpm: 10, daily: 500 },
    retentionHours: 24,
    allowsScraping: false,
    complianceTags: ["mls", "broker"],
    humanVerificationRequired: true,
    enabledByDefault: false,
    stubOnly: true,
  },
  {
    id: "government_cadastre",
    kind: "official",
    label: "Government cadastre / land registry API",
    regions: ["US", "CA", "TW"],
    lanes: ["parcel"],
    envKeyName: null,
    authScope: "Official land registry — adapter per jurisdiction TBD",
    rateLimit: { rpm: 10, daily: 200 },
    retentionHours: 168,
    allowsScraping: false,
    complianceTags: ["cadastre"],
    humanVerificationRequired: true,
    enabledByDefault: false,
    stubOnly: true,
  },
  {
    id: "building_abstract",
    kind: "official",
    label: "Building abstract / 建物謄本",
    regions: ["TW"],
    lanes: ["building"],
    envKeyName: null,
    authScope: "Official building registry or user-uploaded certified copy",
    rateLimit: { rpm: 5, daily: 50 },
    retentionHours: 72,
    allowsScraping: false,
    complianceTags: ["building_abstract"],
    humanVerificationRequired: true,
    enabledByDefault: false,
    stubOnly: true,
  },
  {
    id: "hoa_condo_docs",
    kind: "user_upload",
    label: "HOA / Condo / Strata document upload",
    regions: ["US", "CA", "TW"],
    lanes: ["hoa"],
    envKeyName: null,
    authScope: "User-supplied governing docs only — never scraped from portals",
    rateLimit: { rpm: 20, daily: 200 },
    retentionHours: 720,
    allowsScraping: false,
    complianceTags: ["hoa_condo"],
    humanVerificationRequired: true,
    enabledByDefault: true,
  },
  {
    id: "user_url_fetch",
    kind: "user_upload",
    label: "User-initiated listing URL fetch",
    regions: ["US", "CA", "TW", "OTHER"],
    lanes: ["listing"],
    envKeyName: null,
    authScope:
      "Single-page fetch only when the user pastes a URL; SSRF-guarded; untrusted content — not proactive scraping",
    rateLimit: { rpm: 20, daily: 200 },
    retentionHours: 72,
    allowsScraping: false,
    complianceTags: ["broker"],
    humanVerificationRequired: true,
    enabledByDefault: true,
  },
];
