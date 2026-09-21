import { createAdminClient } from "@/utils/supabase/admin";

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
};

/**
 * Dedupe by (country_code, canonical normalized address).
 */
export async function findOrCreateProperty(input: {
  normalizedAddress: string;
  lat: number;
  lng: number;
  zoning?: string | null;
  yearBuilt?: number | null;
  countryCode?: string | null;
  admin1?: string | null;
  city?: string | null;
  postalCode?: string | null;
}): Promise<string> {
  const normalizedAddress = input.normalizedAddress.trim().toLowerCase();
  if (
    normalizedAddress.length < 3 ||
    normalizedAddress.length > 500 ||
    /[\u0000-\u001f\u007f]/.test(normalizedAddress)
  ) {
    throw new Error("properties 去重失敗：地址格式無效");
  }
  if (
    !Number.isFinite(input.lat) ||
    input.lat < -90 ||
    input.lat > 90 ||
    !Number.isFinite(input.lng) ||
    input.lng < -180 ||
    input.lng > 180
  ) {
    throw new Error("properties 去重失敗：座標格式無效");
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
    p_normalized_address: normalizedAddress,
    p_lat: input.lat,
    p_lng: input.lng,
    p_zoning: input.zoning ?? null,
    p_year_built: input.yearBuilt ?? null,
    p_country_code: input.countryCode ?? null,
    p_admin1: input.admin1 ?? null,
    p_city: input.city ?? null,
    p_postal_code: input.postalCode ?? null,
  });

  if (error) {
    throw new Error(`properties 去重失敗：${error.message}`);
  }
  if (!data || typeof data !== "string") {
    throw new Error("properties 去重失敗：沒有回傳 id");
  }
  return data;
}
