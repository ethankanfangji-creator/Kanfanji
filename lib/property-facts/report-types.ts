/**
 * External report DTO projected from PropertyFactCard.
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
  disclaimer: string;
};
