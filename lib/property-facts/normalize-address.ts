import { canonicalizeAddressQuery } from "@/lib/property-intel/normalize-query";

/**
 * Address Normalizer stage — local canonicalization only (no network).
 */
export function normalizeAddressQuery(raw: string): {
  rawAddress: string;
  normalizedQuery: string;
  unitHint: string | null;
} {
  const rawAddress = raw.trim();
  const unitMatch =
    rawAddress.match(
      /(\d+\s*[樓层層]|unit\s*#?\s*\d+|apt\.?\s*#?\s*\d+|#\s*\d+\b|之\d+|戶\s*\d+)/i,
    ) ?? null;
  const normalizedQuery = canonicalizeAddressQuery(rawAddress) || rawAddress;
  return {
    rawAddress,
    normalizedQuery,
    unitHint: unitMatch?.[0]?.trim() ?? null,
  };
}

export { canonicalizeAddressQuery };
