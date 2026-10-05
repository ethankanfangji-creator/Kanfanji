import { parseMapCoordinate } from "@/lib/map/static-map";

/**
 * URL that opens the device maps app when possible (Apple Maps / Google Maps),
 * otherwise the maps website — so the viewer can see the pin in their default map.
 */
export function buildOpenInMapsUrl(
  lat: number,
  lng: number,
  label?: string | null,
): string {
  const safeLabel = (label ?? "").trim().slice(0, 200);
  const query = safeLabel ? `${lat},${lng} (${safeLabel})` : `${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Confirmed site pin first, then property / row coords. */
export function extractConfirmedMapCoords(input: {
  chatState?: unknown;
  property?: unknown;
  lat?: unknown;
  lng?: unknown;
}): { lat: number; lng: number } | null {
  const chatState =
    input.chatState && typeof input.chatState === "object" && !Array.isArray(input.chatState)
      ? (input.chatState as Record<string, unknown>)
      : null;
  const pin =
    chatState?.sitePin && typeof chatState.sitePin === "object" && !Array.isArray(chatState.sitePin)
      ? (chatState.sitePin as Record<string, unknown>)
      : null;
  const pinLat = parseMapCoordinate(pin?.lat);
  const pinLng = parseMapCoordinate(pin?.lng);
  if (pinLat != null && pinLng != null) return { lat: pinLat, lng: pinLng };

  const property =
    input.property && typeof input.property === "object" && !Array.isArray(input.property)
      ? (input.property as Record<string, unknown>)
      : null;
  const propLat = parseMapCoordinate(property?.lat ?? input.lat);
  const propLng = parseMapCoordinate(property?.lng ?? input.lng);
  if (propLat != null && propLng != null) return { lat: propLat, lng: propLng };
  return null;
}
