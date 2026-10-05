import { extractConfirmedMapCoords } from "@/lib/map/open-in-maps";
import { coerceDecisionStatus } from "@/lib/portfolio/decision-status";
import type { DecisionStatus } from "@/lib/portfolio/types";

/** Lean row for `/viewings` browse UI — no chat_state / messages blob. */
export type ViewingListItem = {
  id: string;
  address: string;
  updated_at: string;
  created_at: string;
  photo_urls: string[];
  video_urls: string[];
  decisionStatus: DecisionStatus | null;
  hasReport: boolean;
  /** Confirmed site pin (chat_state.sitePin) or property coords — for map cover. */
  lat: number | null;
  lng: number | null;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function hasReportPayload(row: Record<string, unknown>): boolean {
  const report = row.report;
  if (report && typeof report === "object" && !Array.isArray(report)) {
    return Object.keys(report as object).length > 0;
  }
  const chatState = row.chat_state;
  if (chatState && typeof chatState === "object" && !Array.isArray(chatState)) {
    const fingerprint = (chatState as { reportNotesFingerprint?: unknown }).reportNotesFingerprint;
    if (typeof fingerprint === "string" && fingerprint.trim()) return true;
    const nested = (chatState as { report?: unknown }).report;
    if (nested && typeof nested === "object") return true;
  }
  return false;
}

/** Map a projected viewing row (+ optional chat_state) into a list card DTO. */
export function toViewingListItem(row: Record<string, unknown>): ViewingListItem | null {
  const id = typeof row.id === "string" ? row.id : null;
  const address = typeof row.address === "string" ? row.address : null;
  if (!id || !address) return null;

  const chatState =
    row.chat_state && typeof row.chat_state === "object" && !Array.isArray(row.chat_state)
      ? (row.chat_state as Record<string, unknown>)
      : null;
  const coords = extractConfirmedMapCoords({
    chatState,
    property: row.property,
    lat: row.lat,
    lng: row.lng,
  });
  const lat = coords?.lat ?? null;
  const lng = coords?.lng ?? null;

  return {
    id,
    address,
    updated_at:
      typeof row.updated_at === "string" ? row.updated_at : new Date(0).toISOString(),
    created_at:
      typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
    photo_urls: asStringArray(row.photo_urls),
    video_urls: asStringArray(row.video_urls),
    decisionStatus: coerceDecisionStatus(chatState?.decisionStatus),
    hasReport: hasReportPayload(row),
    lat,
    lng,
  };
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export type ViewingListCover =
  | { kind: "map"; lat: number; lng: number }
  | { kind: "photo"; url: string }
  | { kind: "empty" };

/**
 * Card cover: confirmed pin map first; only use photo when it is already an http(s) URL
 * (DB photo_urls are usually storage paths, not displayable).
 */
export function viewingListCover(
  viewing: Pick<ViewingListItem, "lat" | "lng" | "photo_urls">,
): ViewingListCover {
  if (viewing.lat != null && viewing.lng != null) {
    return { kind: "map", lat: viewing.lat, lng: viewing.lng };
  }
  const photo = viewing.photo_urls.find(isHttpUrl);
  if (photo) return { kind: "photo", url: photo };
  return { kind: "empty" };
}
