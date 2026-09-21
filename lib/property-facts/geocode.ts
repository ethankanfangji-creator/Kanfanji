import { geocodeWithGoogle } from "@/lib/property-intel/google-places";
import { normalizeAddress } from "@/lib/normalize-address";
import { makeEvidence, ttlHoursForLane } from "./evidence";
import { deriveJurisdiction, jurisdictionKey } from "./jurisdiction";
import type { Evidence, Jurisdiction, PropertyRegion } from "./types";

export type GeocodeResult = {
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
  geocodeOk: boolean;
  identityEvidence: Evidence<unknown>[];
  sourceId: string | null;
};

function countryToRegion(countryCode: string | null, countryName: string | null): PropertyRegion {
  const code = (countryCode || "").toUpperCase();
  const name = (countryName || "").toLowerCase();
  if (code === "CA" || /canada|加拿大/.test(name)) return "CA";
  if (code === "US" || /united states|usa|美國|美国/.test(name)) return "US";
  if (code === "TW" || /taiwan|台灣|臺灣|中華民國/.test(name)) return "TW";
  return "OTHER";
}

function regionFromAddressHeuristics(query: string): PropertyRegion {
  if (/台灣|臺灣|台北|臺北|新北|桃園|台中|臺中|高雄|台南|臺南|\bTW\b|Taiwan/i.test(query)) {
    return "TW";
  }
  if (
    /\b(BC|B\.C\.|British Columbia|Vancouver|Burnaby|Richmond|Surrey|Coquitlam|Ontario|Toronto|Canada|Alberta|Montreal)\b/i.test(
      query,
    ) ||
    /加拿大|溫哥華|本拿比|列治文/.test(query)
  ) {
    return "CA";
  }
  if (
    /\b(USA|United States)\b/.test(query) ||
    /,\s*[A-Z]{2}\s+\d{5}(-\d{4})?\b/.test(query)
  ) {
    return "US";
  }
  return "OTHER";
}

function mapCountryCode(country: string | null | undefined, explicit?: string | null): string | null {
  if (explicit) return explicit.toUpperCase().slice(0, 2);
  if (!country) return null;
  const c = country.toLowerCase();
  if (c === "ca" || c === "canada" || /加拿大/.test(country)) return "CA";
  if (c === "us" || c === "usa" || /united states|美國|美国/.test(c)) return "US";
  if (c === "tw" || /taiwan|台灣|臺灣/.test(c)) return "TW";
  if (/^[a-z]{2}$/i.test(country)) return country.toUpperCase();
  return null;
}

/**
 * Geocoding stage: BC Geocoder → Nominatim → Google fallback.
 */
export async function geocodeForFacts(normalizedQuery: string): Promise<GeocodeResult> {
  const now = new Date().toISOString();
  const ttl = ttlHoursForLane("identity");
  const identityEvidence: Evidence<unknown>[] = [];

  let displayAddress: string | null = null;
  let countryName: string | null = null;
  let countryCode: string | null = null;
  let admin1: string | null = null;
  let city: string | null = null;
  let postalCode: string | null = null;
  let county: string | null = null;
  let municipality: string | null = null;
  let district: string | null = null;
  let houseNumber: string | null = null;
  let lat: number | null = null;
  let lng: number | null = null;
  let sourceId: string | null = null;
  let sourceLabel = "";
  let sourceClass: "official" | "licensed" | "public_web" = "official";

  try {
    const normalized = await normalizeAddress(normalizedQuery);
    lat = normalized.lat;
    lng = normalized.lng;
    displayAddress = normalized.formatted_address;
    city = normalized.city ?? null;
    admin1 = normalized.province ?? null;
    countryName = normalized.country ?? null;
    postalCode = normalized.postalCode ?? null;
    county = normalized.county ?? null;
    municipality = normalized.municipality ?? null;
    district = normalized.district ?? null;
    houseNumber = normalized.houseNumber ?? null;
    countryCode = mapCountryCode(normalized.country, normalized.countryCode);
    sourceId = normalized.source.includes("BC")
      ? "bc_geocoder"
      : normalized.source.includes("Nominatim") || normalized.source.includes("OSM")
        ? "nominatim"
        : "geocoder";
    sourceLabel = normalized.source;
    sourceClass = sourceId === "bc_geocoder" ? "official" : "public_web";
  } catch {
    // continue to Google
  }

  if (lat == null || lng == null) {
    const g = await geocodeWithGoogle(normalizedQuery);
    if (g) {
      lat = g.lat;
      lng = g.lng;
      if (g.formattedAddress) displayAddress = g.formattedAddress;
      sourceId = "google_geocoding";
      sourceLabel = "Google Geocoding";
      sourceClass = "licensed";
    }
  }

  let region = countryToRegion(countryCode, countryName);
  if (sourceId === "bc_geocoder") {
    region = "CA";
    countryCode = "CA";
  }
  if (region === "OTHER") {
    region = regionFromAddressHeuristics(normalizedQuery);
  }
  if (!countryCode && region !== "OTHER") {
    countryCode = region;
  }

  const geocodeOk = lat != null && lng != null;
  const jurisdiction = deriveJurisdiction({
    region,
    query: normalizedQuery,
    admin1,
    city,
    county,
    municipality,
    district,
    houseNumber,
  });
  const key = jurisdictionKey(jurisdiction);
  const matchLevel =
    sourceId === "bc_geocoder" || houseNumber || jurisdiction.doorplate
      ? "exact_parcel"
      : geocodeOk
        ? "street"
        : "inferred";

  const pushId = <T>(field: string, value: T | null | undefined) => {
    if (value == null || (typeof value === "string" && !value.trim())) return;
    identityEvidence.push(
      makeEvidence({
        lane: "listing",
        field,
        value,
        sourceClass: sourceId === "bc_geocoder" ? "official" : sourceClass,
        sourceType:
          sourceId === "bc_geocoder"
            ? "official"
            : sourceId === "google_geocoding"
              ? "licensed_vendor"
              : sourceId === "nominatim"
                ? "public_web"
                : "user",
        sourceId: sourceId ?? "address_normalizer",
        sourceLabel: sourceLabel || "Address Normalizer",
        fetchedAt: now,
        ttlHours: ttl,
        matchLevel,
      }),
    );
  };

  pushId("normalizedAddress", normalizedQuery);
  if (geocodeOk) {
    pushId("displayAddress", displayAddress);
    pushId("countryCode", countryCode);
    pushId("admin1", jurisdiction.admin1);
    pushId("county", jurisdiction.county);
    pushId("city", jurisdiction.city);
    pushId("municipality", jurisdiction.municipality);
    pushId("district", jurisdiction.district);
    pushId("section", jurisdiction.section);
    pushId("doorplate", jurisdiction.doorplate);
    pushId("postalCode", postalCode);
    pushId("lat", lat);
    pushId("lng", lng);
  } else {
    pushId("admin1", jurisdiction.admin1);
    pushId("district", jurisdiction.district);
    pushId("section", jurisdiction.section);
    pushId("doorplate", jurisdiction.doorplate);
  }

  return {
    region,
    displayAddress,
    countryCode,
    admin1: jurisdiction.admin1,
    city: jurisdiction.city,
    postalCode,
    jurisdiction,
    jurisdictionKey: key,
    lat,
    lng,
    geocodeOk,
    identityEvidence,
    sourceId,
  };
}
