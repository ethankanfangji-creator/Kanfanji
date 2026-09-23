import type { MatchLevel, SourceType } from "./types";

const EIGHTEEN_MONTHS_MS = 18 * 30 * 24 * 3600_000;

function clamp(n: number): number {
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

function isExact(match: MatchLevel): boolean {
  return match === "exact_unit" || match === "exact_parcel";
}

/**
 * Confidence is computed. Adapters must not invent the final score.
 *
 * 0.95–1.00 official + exact address + fresh
 * 0.80–0.94 licensed + exact + fresh
 * 0.60–0.79 reliable public or street-level / possibly stale
 * 0.40–0.59 neighborhood stats or indirect
 * 0.00–0.39 model, unverifiable, or conflict (conflict caps the winner here)
 */
export function scoreConfidence(input: {
  sourceType: SourceType;
  matchLevel: MatchLevel;
  retrievedAt: string;
  effectiveDate?: string | null;
  conflict?: boolean;
  now?: number;
}): number {
  const now = input.now ?? Date.now();
  const exact = isExact(input.matchLevel);
  const street = input.matchLevel === "street";
  const neighborhood = input.matchLevel === "neighborhood";

  let score: number;
  switch (input.sourceType) {
    case "official":
    case "public_record":
      score = exact ? 0.97 : street ? 0.72 : neighborhood ? 0.55 : 0.48;
      break;
    case "licensed_vendor":
    case "licensed_listing":
      score = exact ? 0.86 : street ? 0.7 : neighborhood ? 0.55 : 0.48;
      break;
    case "crawl_service":
      score = exact ? 0.7 : 0.58;
      break;
    case "public_web":
      score = exact ? 0.68 : street ? 0.62 : 0.5;
      break;
    case "listing_claim":
      score = exact ? 0.82 : 0.62;
      break;
    case "area_statistic":
      score = 0.5;
      break;
    case "user":
      score = exact ? 0.74 : 0.6;
      break;
    default:
      score = 0.2;
  }

  const asOf = input.effectiveDate ?? input.retrievedAt;
  const asOfMs = new Date(asOf).getTime();
  if (Number.isFinite(asOfMs) && now - asOfMs > EIGHTEEN_MONTHS_MS) {
    score = Math.min(score - 0.15, 0.79);
  }

  if (input.conflict) {
    score = Math.min(score, 0.59);
  }

  if (input.sourceType === "model_estimate") {
    score = Math.min(score, 0.39);
  }

  return clamp(score);
}

export function claimCannotConfirm(sourceType: SourceType): boolean {
  return (
    sourceType === "listing_claim" ||
    sourceType === "area_statistic" ||
    sourceType === "model_estimate"
  );
}
