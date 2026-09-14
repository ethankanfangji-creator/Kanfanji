import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";

export type PropertyRecord = {
  id: string;
  normalized_address: string;
  lat: number | null;
  lng: number | null;
  year_built: number | null;
  zoning: string | null;
  view_count: number;
};

function createLookupClient() {
  try {
    return createAdminClient();
  } catch {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      throw new Error("缺少 Supabase 環境變數，無法寫入 properties");
    }
    return createClient(url, key);
  }
}

/**
 * Dedupe by exact normalized address or within 500m.
 * Returns a single property_id (no public aggregation UI yet).
 */
export async function findOrCreateProperty(input: {
  normalizedAddress: string;
  lat: number;
  lng: number;
  zoning?: string | null;
  yearBuilt?: number | null;
}): Promise<string> {
  const supabase = createLookupClient();
  const { data, error } = await supabase.rpc("find_or_create_property", {
    p_normalized_address: input.normalizedAddress,
    p_lat: input.lat,
    p_lng: input.lng,
    p_zoning: input.zoning ?? null,
    p_year_built: input.yearBuilt ?? null,
  });

  if (error) {
    throw new Error(`properties 去重失敗：${error.message}`);
  }
  if (!data || typeof data !== "string") {
    throw new Error("properties 去重失敗：沒有回傳 id");
  }
  return data;
}
