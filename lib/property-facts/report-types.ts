/**
 * External report DTO projected from PropertyFactCard.
 */

export const PROPERTY_REPORT_DISCLAIMER =
  "This report is informational and is not a legal, tax, appraisal, inspection, lending, or investment opinion.";

export const PROPERTY_REPORT_DISCLAIMER_ZH =
  "本報告僅供資訊參考，不構成法律、稅務、鑑價、驗屋、貸款或投資建議。";

/** Fixed report table of contents (zh-Hant). */
export const REPORT_SECTION_CATALOG = [
  { id: "address", title: "地址與座標" },
  { id: "property", title: "房屋／建物摘要" },
  { id: "condition", title: "屋況與翻修證據" },
  { id: "costs", title: "售價、租金、稅費與管理費" },
  { id: "market", title: "交易與同類物件" },
  { id: "amenities", title: "生活機能" },
  { id: "transit", title: "交通" },
  { id: "zoning", title: "分區、建照與可能限制" },
  { id: "risks", title: "災害與環境風險" },
  { id: "confidence", title: "資料可信度" },
  { id: "verification", title: "未確認事項與建議的人工查證清單" },
  { id: "disclaimer", title: "免責聲明" },
] as const;

export type ReportSectionId = (typeof REPORT_SECTION_CATALOG)[number]["id"];

export type SourceSnippetLanguage = "en" | "fr" | "zh" | "other";

export type ReportSourceSnippet = {
  evidence_id: string;
  /** Original source text — not translated away */
  original_text: string;
  language: SourceSnippetLanguage;
};

export type ReportNarrativeSection = {
  id: string;
  title: string;
  body: string;
  evidence_ids: string[];
};

/** Deterministic Traditional Chinese narrative citing evidence ids only. */
export type ReportNarrative = {
  locale: "zh-Hant";
  summary_zh: string;
  sections_zh: ReportNarrativeSection[];
  source_snippets: ReportSourceSnippet[];
  disclaimer_zh: string;
};

export type ReportHumanVerificationItem = {
  id: string;
  label_zh: string;
  related_fields: string[];
  status: "pending" | "done" | "waived";
};

export type ReportCompliance = {
  no_scraping: true;
  providers_used: Array<{ id: string; kind: string; auth_scope: string }>;
  providers_skipped: Array<{ id: string; reason: string }>;
  notices: string[];
  human_verification: {
    required: boolean;
    checklist: ReportHumanVerificationItem[];
  };
};

export type ReportClaimBasis =
  | "official"
  | "public_record"
  | "licensed_vendor"
  | "licensed_listing"
  | "crawl_service"
  | "listing_claim"
  | "public_web"
  | "area_statistic"
  | "user"
  | "unverified"
  | null;

export type ReportEvidenceItem = {
  id: string;
  field: string;
  value: unknown;
  unit: string | null;
  source_type: string | null;
  source_name: string | null;
  source_url: string | null;
  retrieved_at: string | null;
  effective_date: string | null;
  confidence: number | null;
  match_level: string | null;
  evidence: string | null;
  limitations: string | null;
  status: "found" | "needs_human" | "conflict";
};

export type ReportClaimable<T> = {
  value: T | null;
  basis: ReportClaimBasis;
  status: "found" | "not_found" | "needs_human" | "conflict";
  confidence: number | null;
  evidence_id: string | null;
};

export type ReportLocationItem = {
  name: string;
  kind: string;
  /** Straight-line meters between property and POI */
  straight_line_meters: number | null;
  /** Estimated walking minutes */
  walking_minutes: number | null;
  /** Driving minutes without traffic emphasis */
  driving_minutes: number | null;
  /** Peak / traffic-aware driving minutes when available */
  peak_driving_minutes: number | null;
  evidence_id: string | null;
};

export type ReportAddressComponents = {
  street_number: string | null;
  street_name: string | null;
  city: string | null;
  admin1: string | null;
  county: string | null;
  district: string | null;
  section: string | null;
  doorplate: string | null;
  postal_code: string | null;
  country: string | null;
};

export type ReportMatch = {
  level: string;
  place_id: string | null;
  parcel_id: string | null;
  building_id: string | null;
  unit_id: string | null;
  listing_id: string | null;
  notes: string[];
};

export type ReportCountryAdapter = {
  id: string;
  units: {
    area: string;
    currency: string;
  };
  available_data_types: string[];
  providers_preferred: string[];
  providers_disabled: string[];
  structural_gaps: string[];
  legal_notices: string[];
  fee_label: string;
  fee_label_zh: string;
  localized_labels: {
    locale: string;
    labels: Record<string, string>;
  };
};

export type PropertyReport = {
  request: {
    input_address: string;
    normalized_address: string;
    country: "US" | "CA" | "TW" | "OTHER";
    coordinates: { lat: number | null; lng: number | null };
    place_id: string | null;
    address_components: ReportAddressComponents;
    jurisdiction_key: string | null;
    match: ReportMatch | null;
    adapter: ReportCountryAdapter | null;
  };
  property: {
    property_type: string | null;
    year_built: number | null;
    building_area: number | null;
    lot_area: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    parking: null;
    condition: { value: string | null; basis: ReportClaimBasis };
  };
  costs: {
    listing_price: ReportClaimable<string>;
    property_tax: ReportClaimable<string>;
    hoa_or_management_fee: ReportClaimable<string>;
    special_assessment: ReportClaimable<string>;
    insurance_estimate: ReportClaimable<string>;
  };
  market: {
    recent_comparables: [];
    estimated_price_range: string | null;
    estimated_rent_range: string | null;
    days_on_market: null;
    currency: string | null;
    last_sold: string | null;
  };
  location: {
    schools: ReportLocationItem[];
    transit: ReportLocationItem[];
    shopping: ReportLocationItem[];
    medical: ReportLocationItem[];
    parks: ReportLocationItem[];
    dining: ReportLocationItem[];
    walkability: null;
  };
  risks: {
    flood: string | null;
    earthquake: string | null;
    wildfire: string | null;
    noise: string | null;
    zoning: string | null;
    permit_or_violation: string | null;
    data_gaps: string[];
  };
  evidence: ReportEvidenceItem[];
  /** zh-Hant narrative + preserved EN/FR (etc.) source snippets */
  narrative: ReportNarrative;
  compliance: ReportCompliance;
  disclaimer: string;
};
