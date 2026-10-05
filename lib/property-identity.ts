import { splitAddressQuery } from "@/lib/address-suggest";

export type PropertyCountryCode = "CA" | "US" | "TW" | "OTHER" | "UNKNOWN";

export type PropertyIdentity = {
  streetNormalized: string;
  unitKey: string;
  unitLabel: string | null;
  countryCode: PropertyCountryCode;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
};

const STREET_SUFFIX: Record<string, string> = {
  street: "st",
  st: "st",
  avenue: "ave",
  ave: "ave",
  road: "rd",
  rd: "rd",
  drive: "dr",
  dr: "dr",
  boulevard: "blvd",
  blvd: "blvd",
  lane: "ln",
  ln: "ln",
  way: "way",
  court: "ct",
  ct: "ct",
  place: "pl",
  pl: "pl",
  crescent: "cres",
  cres: "cres",
};

function normalizeStreetText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.]/g, "")
    .split(",")
    .map((segment) =>
      segment
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => STREET_SUFFIX[word] ?? word)
        .join(" "),
    )
    .filter(Boolean)
    .join(", ");
}

function compactFallback(unit: string): string {
  return unit
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .slice(0, 64);
}

/**
 * Canonical unit identity for property dedupe.
 * Empty string means "no unit specified" (building / civic only).
 */
export function canonicalizeUnitKey(unit: string | null | undefined): string {
  const raw = (unit ?? "").trim();
  if (!raw) return "";

  const floor = raw.match(/^(\d+)\s*[樓层層]$/u);
  if (floor) return `floor:${floor[1]}`;

  const zhi = raw.match(/^之\s*(\d+[a-z]?)$/iu);
  if (zhi) return `zhi:${zhi[1]!.toLowerCase()}`;

  const hu = raw.match(/^戶\s*([\w\p{L}-]+)$/u);
  if (hu) return `hu:${hu[1]!.toLowerCase()}`;

  const english = raw.match(
    /^(?:unit|apt\.?|apartment|suite)\s*#?\s*([a-z0-9-]+)$/i,
  );
  if (english) return english[1]!.toLowerCase();

  const hash = raw.match(/^#\s*([a-z0-9-]+)$/i);
  if (hash) return hash[1]!.toLowerCase();

  if (/^\d+[a-z]?$/i.test(raw)) return raw.toLowerCase();

  const fallback = compactFallback(raw);
  return fallback || "";
}

/** Display label for a unit token (null when absent). */
export function displayUnitLabel(unit: string | null | undefined): string | null {
  const raw = (unit ?? "").trim();
  if (!raw) return null;
  if (/[樓层層戶之]/.test(raw)) return raw.replace(/\s+/g, "");
  if (/^unit\b/i.test(raw)) return raw.replace(/^unit\s*#?\s*/i, "Unit ").trim();
  if (/^#/.test(raw)) return `Unit ${raw.replace(/^#\s*/, "")}`;
  if (/^(apt|apartment)\b/i.test(raw)) {
    return raw.replace(/^(apt|apartment)\.?\s*#?\s*/i, "Apt ").trim();
  }
  if (/^suite\b/i.test(raw)) {
    return raw.replace(/^suite\.?\s*#?\s*/i, "Suite ").trim();
  }
  if (/^\d+[a-z]?$/i.test(raw)) return `Unit ${raw}`;
  return raw;
}

export function normalizeCountryCode(
  value: string | null | undefined,
): PropertyCountryCode {
  const upper = (value ?? "").trim().toUpperCase();
  if (upper === "CA" || upper === "US" || upper === "TW" || upper === "OTHER") {
    return upper;
  }
  return "UNKNOWN";
}

function asFiniteCoord(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Resolve street-only normalized address + unit identity from a free-text address.
 */
export function resolvePropertyIdentity(input: {
  address: string;
  countryCode?: string | null;
  unitLabel?: string | null;
  unitKey?: string | null;
  lat?: number | null;
  lng?: number | null;
  placeId?: string | null;
}): PropertyIdentity {
  const address = input.address.trim().replace(/\s+/g, " ");
  const split = splitAddressQuery(address);
  const unitRaw = (input.unitLabel ?? "").trim() || split.unit;
  const unitKey =
    typeof input.unitKey === "string" && input.unitKey.trim()
      ? canonicalizeUnitKey(input.unitKey)
      : canonicalizeUnitKey(unitRaw);
  const unitLabel = displayUnitLabel(unitRaw);
  // Street line keeps city/region; unit tokens are stripped by splitAddressQuery.
  const streetNormalized = normalizeStreetText(split.streetQuery || address).slice(
    0,
    500,
  );
  const lat = asFiniteCoord(input.lat);
  const lng = asFiniteCoord(input.lng);
  const coordsValid =
    lat != null &&
    lng != null &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;

  return {
    streetNormalized,
    unitKey,
    unitLabel,
    countryCode: normalizeCountryCode(input.countryCode),
    lat: coordsValid ? lat : null,
    lng: coordsValid ? lng : null,
    placeId:
      typeof input.placeId === "string" && input.placeId.trim()
        ? input.placeId.trim().slice(0, 200)
        : null,
  };
}
