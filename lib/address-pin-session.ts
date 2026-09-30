const DRAFT_KEY = "kanfangji.addressPinDraft.v1";
const ACTIVE_KEY = "kanfangji.viewingChat.activeId.v1";

export type AddressPinDraft = {
  queryAddress: string;
  displayAddress: string;
  hintLat: number;
  hintLng: number;
  picked: { lat: number; lng: number } | null;
  propertyId: string | null;
  source: string | null;
  region: "CA" | "US" | "TW" | "OTHER" | null;
};

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function point(value: unknown): { lat: number; lng: number } | null {
  if (!value || typeof value !== "object") return null;
  const lat = finite((value as { lat?: unknown }).lat);
  const lng = finite((value as { lng?: unknown }).lng);
  if (lat == null || lng == null) return null;
  return { lat, lng };
}

export function readAddressPinDraft(): AddressPinDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AddressPinDraft>;
    const hintLat = finite(parsed.hintLat);
    const hintLng = finite(parsed.hintLng);
    if (!parsed.queryAddress || !parsed.displayAddress || hintLat == null || hintLng == null) {
      return null;
    }
    const region = parsed.region;
    return {
      queryAddress: parsed.queryAddress,
      displayAddress: parsed.displayAddress,
      hintLat,
      hintLng,
      picked: point(parsed.picked),
      propertyId: parsed.propertyId ?? null,
      source: parsed.source ?? null,
      region: region === "CA" || region === "US" || region === "TW" || region === "OTHER" ? region : null,
    };
  } catch {
    return null;
  }
}

export function writeAddressPinDraft(draft: AddressPinDraft) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function clearAddressPinDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DRAFT_KEY);
}

export function readActiveThreadId(): string | null {
  if (typeof window === "undefined") return null;
  const id = window.localStorage.getItem(ACTIVE_KEY);
  return id && id.trim() ? id : null;
}

export function writeActiveThreadId(id: string | null) {
  if (typeof window === "undefined") return;
  if (!id) window.localStorage.removeItem(ACTIVE_KEY);
  else window.localStorage.setItem(ACTIVE_KEY, id);
}
