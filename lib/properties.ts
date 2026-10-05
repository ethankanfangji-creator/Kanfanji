import { createAdminClient } from "@/utils/supabase/admin";
import {
  resolvePropertyIdentity,
  type PropertyIdentity,
} from "@/lib/property-identity";

export type PropertyRecord = {
  id: string;
  normalized_address: string;
  lat: number | null;
  lng: number | null;
  year_built: number | null;
  zoning: string | null;
  view_count: number;
  country_code?: string | null;
  admin1?: string | null;
  city?: string | null;
  postal_code?: string | null;
  unit_key?: string | null;
  unit_label?: string | null;
  place_id?: string | null;
};

/**
 * Dedupe by (country_code, street normalized address, unit_key).
 * Coordinates are optional.
 */
export async function findOrCreateProperty(input: {
  normalizedAddress: string;
  lat?: number | null;
  lng?: number | null;
  zoning?: string | null;
  yearBuilt?: number | null;
  countryCode?: string | null;
  admin1?: string | null;
  city?: string | null;
  postalCode?: string | null;
  unitKey?: string | null;
  unitLabel?: string | null;
  placeId?: string | null;
}): Promise<string> {
  const rawAddress = input.normalizedAddress ?? "";
  if (/[\u0000-\u001f\u007f]/.test(rawAddress)) {
    throw new Error("properties 去重失敗：地址格式無效");
  }

  const hasLat = input.lat != null;
  const hasLng = input.lng != null;
  if (hasLat !== hasLng) {
    throw new Error("properties 去重失敗：座標格式無效");
  }
  if (hasLat && hasLng) {
    const lat = Number(input.lat);
    const lng = Number(input.lng);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      throw new Error("properties 去重失敗：座標格式無效");
    }
  }

  const identity: PropertyIdentity = resolvePropertyIdentity({
    address: rawAddress,
    countryCode: input.countryCode,
    unitKey: input.unitKey,
    unitLabel: input.unitLabel,
    lat: input.lat,
    lng: input.lng,
    placeId: input.placeId,
  });

  // When caller already stripped the unit into unitKey/unitLabel and passed a
  // street-only address, prefer that street string after basic normalize.
  const street =
    identity.streetNormalized ||
    rawAddress.trim().toLowerCase().slice(0, 500);

  if (street.length < 3 || street.length > 500) {
    throw new Error("properties 去重失敗：地址格式無效");
  }
  if (
    input.yearBuilt != null &&
    (!Number.isInteger(input.yearBuilt) ||
      input.yearBuilt < 1000 ||
      input.yearBuilt > new Date().getUTCFullYear() + 5)
  ) {
    throw new Error("properties 去重失敗：建造年份格式無效");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("find_or_create_property", {
    p_normalized_address: street,
    p_lat: identity.lat,
    p_lng: identity.lng,
    p_zoning: input.zoning ?? null,
    p_year_built: input.yearBuilt ?? null,
    p_country_code: identity.countryCode,
    p_admin1: input.admin1 ?? null,
    p_city: input.city ?? null,
    p_postal_code: input.postalCode ?? null,
    p_unit_key: identity.unitKey,
    p_unit_label: identity.unitLabel,
    p_place_id: identity.placeId,
  });

  if (error) {
    throw new Error(`properties 去重失敗：${error.message}`);
  }
  if (!data || typeof data !== "string") {
    throw new Error("properties 去重失敗：沒有回傳 id");
  }
  return data;
}
