import type {
  DecisionSummaryBuildInput,
  DecisionSummarySnapshot,
  SharePhotoItem,
  ShareTextItem,
} from "./types";

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toTextItems(
  items: DecisionSummaryBuildInput["pros"],
  prefix: string,
  defaultSelectedLimit: number,
): ShareTextItem[] {
  if (!items?.length) return [];
  return items
    .map((item, index) => {
      if (typeof item === "string") {
        const text = item.trim();
        if (!text) return null;
        return {
          id: newId(prefix),
          text,
          selected: index < defaultSelectedLimit,
        };
      }
      const text = item.text.trim();
      if (!text) return null;
      return {
        id: item.id || newId(prefix),
        text,
        selected: item.selected ?? index < defaultSelectedLimit,
      };
    })
    .filter((item): item is ShareTextItem => Boolean(item));
}

export function buildDecisionSummary(
  input: DecisionSummaryBuildInput,
): DecisionSummarySnapshot {
  const limit = input.defaultSelectedLimit ?? 3;
  const photos: SharePhotoItem[] = (input.photos ?? [])
    .map((photo, index) => {
      const url = (photo.url || photo.thumbUrl || "").trim();
      return {
        id: String(photo.id),
        url,
        remotePath: photo.remotePath ?? null,
        tag: (photo.tag || "").trim() || "其他",
        note: (photo.note || "").trim(),
        selected: photo.selected ?? index < 5,
      };
    })
    .filter((photo) => photo.url || photo.remotePath);

  const ratingRaw = input.overallRating;
  const rating =
    typeof ratingRaw === "number" && Number.isFinite(ratingRaw)
      ? Math.min(5, Math.max(1, Math.round(ratingRaw)))
      : null;

  return {
    version: 1,
    address: (input.address || "").trim(),
    viewingAt: (input.viewingAt || "").trim(),
    unitLabel: (input.unitLabel || "").trim(),
    priceLabel: (input.priceLabel || "").trim(),
    layoutLabel: (input.layoutLabel || "").trim(),
    areaLabel: (input.areaLabel || "").trim(),
    managementFeeLabel: (input.managementFeeLabel || "").trim(),
    listingUrl: (input.listingUrl || "").trim(),
    setupNotes: (input.setupNotes || "").trim(),
    overallRating: rating,
    pros: toTextItems(input.pros, "pro", limit),
    risks: toTextItems(input.risks, "risk", limit),
    facts: toTextItems(input.facts, "fact", 8),
    followUps: toTextItems(input.followUps, "fu", 8),
    actionItems: toTextItems(input.actionItems, "act", 8),
    photos,
    disclaimer: input.disclaimer.trim(),
    generatedAt: input.generatedAt || new Date().toISOString(),
  };
}

export function selectedTextItems(items: ShareTextItem[]): ShareTextItem[] {
  return items.filter((item) => item.selected && item.text.trim());
}

export function selectedPhotos(items: SharePhotoItem[]): SharePhotoItem[] {
  return items.filter((item) => item.selected && (item.url || item.remotePath));
}

export function toggleTextSelection(
  snapshot: DecisionSummarySnapshot,
  section: "pros" | "risks" | "facts" | "followUps" | "actionItems",
  id: string,
): DecisionSummarySnapshot {
  return {
    ...snapshot,
    [section]: snapshot[section].map((item) =>
      item.id === id ? { ...item, selected: !item.selected } : item,
    ),
  };
}

export function togglePhotoSelection(
  snapshot: DecisionSummarySnapshot,
  id: string,
): DecisionSummarySnapshot {
  return {
    ...snapshot,
    photos: snapshot.photos.map((item) =>
      item.id === id ? { ...item, selected: !item.selected } : item,
    ),
  };
}

export function updateTextItem(
  snapshot: DecisionSummarySnapshot,
  section: "pros" | "risks" | "facts" | "followUps" | "actionItems",
  id: string,
  text: string,
): DecisionSummarySnapshot {
  return {
    ...snapshot,
    [section]: snapshot[section].map((item) =>
      item.id === id ? { ...item, text: text.trim() } : item,
    ),
  };
}

export function setOverallRating(
  snapshot: DecisionSummarySnapshot,
  rating: number | null,
): DecisionSummarySnapshot {
  const next =
    rating == null
      ? null
      : Math.min(5, Math.max(1, Math.round(rating)));
  return { ...snapshot, overallRating: next };
}

/** Public share view: only selected fields; never mutates source ids. */
export function toPublicDecisionSummary(
  snapshot: DecisionSummarySnapshot,
): DecisionSummarySnapshot {
  return {
    ...snapshot,
    pros: selectedTextItems(snapshot.pros),
    risks: selectedTextItems(snapshot.risks),
    facts: selectedTextItems(snapshot.facts),
    followUps: selectedTextItems(snapshot.followUps),
    actionItems: selectedTextItems(snapshot.actionItems),
    photos: selectedPhotos(snapshot.photos).map((photo) => ({
      ...photo,
      selected: true,
    })),
  };
}

export function isDecisionSummarySnapshot(value: unknown): value is DecisionSummarySnapshot {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return obj.version === 1 && typeof obj.address === "string" && Array.isArray(obj.pros);
}

export function formatViewingAt(iso: string): string {
  if (!iso.trim()) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export function decisionSummaryStructure(snapshot: DecisionSummarySnapshot) {
  return {
    version: snapshot.version,
    hasAddress: Boolean(snapshot.address),
    hasViewingAt: Boolean(snapshot.viewingAt),
    hasBasics: Boolean(
      snapshot.unitLabel ||
        snapshot.priceLabel ||
        snapshot.layoutLabel ||
        snapshot.areaLabel ||
        snapshot.managementFeeLabel,
    ),
    rating: snapshot.overallRating,
    prosCount: snapshot.pros.length,
    risksCount: snapshot.risks.length,
    factsCount: snapshot.facts.length,
    followUpsCount: snapshot.followUps.length,
    actionItemsCount: snapshot.actionItems.length,
    photosCount: snapshot.photos.length,
    selectedPros: selectedTextItems(snapshot.pros).length,
    selectedRisks: selectedTextItems(snapshot.risks).length,
    selectedPhotos: selectedPhotos(snapshot.photos).length,
    hasDisclaimer: Boolean(snapshot.disclaimer),
  };
}
