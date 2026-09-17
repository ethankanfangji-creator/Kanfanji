/**
 * Address lookup may enrich tags / Open Data, but must never clobber
 * values the user already typed into the wizard form.
 */

const PROTECTED_SETUP_KEYS = [
  "viewingAt",
  "unitLabel",
  "priceLabel",
  "layoutLabel",
  "areaLabel",
  "managementFeeLabel",
  "listingUrl",
  "setupNotes",
  "decisionSummary",
  "decisionSummaryDraft",
  "overallRating",
  "fieldChecklist",
  "liveAudioMarkers",
  "shareAccess",
  "shareToken",
] as const;

export function resolveLookupDisplayAddress(
  userAddress: string,
  displayAddress?: string | null,
): string {
  if (userAddress.trim()) return userAddress;
  return (displayAddress ?? "").trim() || userAddress;
}

export function fillEmptyText(
  existing: string,
  candidate: string | null | undefined,
): string {
  if (existing.trim()) return existing;
  return typeof candidate === "string" ? candidate : existing;
}

export function mergeAddressLookupPropertyDraft(
  current: Record<string, unknown>,
  lookup: {
    source?: string;
    propertyId?: string | null;
    details?: Record<string, unknown> | null;
  },
): Record<string, unknown> {
  const details = lookup.details && typeof lookup.details === "object" ? lookup.details : {};
  const next: Record<string, unknown> = {
    ...current,
    ...details,
    source: lookup.source ?? current.source,
    propertyId: lookup.propertyId ?? details.propertyId ?? current.propertyId,
  };

  for (const key of PROTECTED_SETUP_KEYS) {
    const prior = current[key];
    if (prior === undefined || prior === null) continue;
    if (typeof prior === "string" && !prior.trim()) continue;
    next[key] = prior;
  }

  return next;
}
