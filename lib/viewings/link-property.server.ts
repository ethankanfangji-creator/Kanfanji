import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findOrCreateProperty } from "@/lib/properties";
import { resolvePropertyIdentity } from "@/lib/property-identity";

export type LinkPropertyInput = {
  address: string;
  countryCode?: string | null;
  lat?: number | null;
  lng?: number | null;
  unitLabel?: string | null;
  unitKey?: string | null;
  placeId?: string | null;
  yearBuilt?: number | null;
};

/**
 * Resolve/create a properties row and return its id.
 * Soft-fails to null so viewing create is never blocked by registry errors.
 */
export async function linkViewingToProperty(
  _admin: SupabaseClient,
  input: LinkPropertyInput,
): Promise<string | null> {
  try {
    const identity = resolvePropertyIdentity({
      address: input.address,
      countryCode: input.countryCode,
      unitLabel: input.unitLabel,
      unitKey: input.unitKey,
      lat: input.lat,
      lng: input.lng,
      placeId: input.placeId,
    });
    if (identity.streetNormalized.length < 3) return null;
    return await findOrCreateProperty({
      normalizedAddress: identity.streetNormalized,
      lat: identity.lat,
      lng: identity.lng,
      countryCode: identity.countryCode,
      unitKey: identity.unitKey,
      unitLabel: identity.unitLabel,
      placeId: identity.placeId,
      yearBuilt: input.yearBuilt ?? null,
    });
  } catch (error) {
    console.error("[linkViewingToProperty]", error);
    return null;
  }
}

export function coordsFromUnknown(
  value: Record<string, unknown> | null | undefined,
): { lat: number; lng: number } | null {
  if (!value) return null;
  const lat = value.lat;
  const lng = value.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function readChatStateLinkFields(chatState: unknown): {
  lat: number | null;
  lng: number | null;
  unitLabel: string | null;
  unitKey: string | null;
  placeId: string | null;
  countryCode: string | null;
} {
  const empty = {
    lat: null as number | null,
    lng: null as number | null,
    unitLabel: null as string | null,
    unitKey: null as string | null,
    placeId: null as string | null,
    countryCode: null as string | null,
  };
  if (!chatState || typeof chatState !== "object" || Array.isArray(chatState)) {
    return empty;
  }
  const state = chatState as Record<string, unknown>;
  const pin =
    state.sitePin && typeof state.sitePin === "object" && !Array.isArray(state.sitePin)
      ? (state.sitePin as Record<string, unknown>)
      : null;
  const lat = typeof pin?.lat === "number" && Number.isFinite(pin.lat) ? pin.lat : null;
  const lng = typeof pin?.lng === "number" && Number.isFinite(pin.lng) ? pin.lng : null;
  return {
    lat,
    lng,
    unitLabel: typeof state.unitLabel === "string" ? state.unitLabel : null,
    unitKey: typeof state.unitKey === "string" ? state.unitKey : null,
    placeId: typeof state.placeId === "string" ? state.placeId : null,
    countryCode:
      typeof state.countryCode === "string"
        ? state.countryCode
        : typeof state.market === "string"
          ? state.market
          : null,
  };
}
