/**
 * External report DTO projected from PropertyFactCard.
 * Scalars are bare values when confirmed; missing stays null; listing claims
 * use { value, basis: "listing_claim" } and never look like confirmed facts.
 */

export const PROPERTY_REPORT_DISCLAIMER =
  "This report is informational and is not a legal, tax, appraisal, inspection, lending, or investment opinion.";

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
  status: "found" | "needs_human";
};

export type ReportClaimable<T> = {
  value: T | null;
  basis: ReportClaimBasis;
  status: "found" | "not_found" | "needs_human";
  confidence: number | null;
  evidence_id: string | null;
};

export type ReportLocationItem = {
  name: string;
  kind: string;
  minutes_walk: number | null;
  evidence_id: string | null;
};

export type PropertyReport = {
  request: {
    input_address: string;
    normalized_address: string;
    country: "US" | "CA" | "TW" | "OTHER";
    coordinates: { lat: number | null; lng: number | null };
    jurisdiction_key: string | null;
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
    listing_price: ReportClaimable<string> | null;
    property_tax: ReportClaimable<string> | null;
    hoa_or_management_fee: ReportClaimable<string> | null;
    special_assessment: ReportClaimable<string> | null;
    insurance_estimate: ReportClaimable<string> | null;
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
    walkability: null;
  };
  risks: {
    flood: null;
    earthquake: null;
    wildfire: null;
    noise: string | null;
    zoning: string | null;
    permit_or_violation: string | null;
    data_gaps: string[];
  };
  evidence: ReportEvidenceItem[];
  disclaimer: string;
};
