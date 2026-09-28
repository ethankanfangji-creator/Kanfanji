import { NextResponse } from "next/server";
import { maxCompareItems } from "@/lib/comparison/entitlement";
import { getAccountTier } from "@/lib/entitlement/tier";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ tier: "guest", maxItems: 2, freeCompare: null }, { headers });
  }
  const admin = createAdminClient();
  try {
    const tier = await getAccountTier(admin, user.id);
    const { data, error } = await admin
      .from("compare_usage")
      .select("source, item_count, is_free_slot")
      .eq("user_id", user.id);
    if (error) throw error;
    const rows = data ?? [];
    const free = rows.find((row) => row.is_free_slot);
    return NextResponse.json(
      {
        tier,
        maxItems: maxCompareItems(tier),
        freeCompare: {
          used: rows.length > 0,
          source: free?.source ?? null,
          itemCount: free?.item_count ?? null,
        },
      },
      { headers },
    );
  } catch {
    return NextResponse.json({ code: "entitlement_unavailable" }, { status: 503, headers });
  }
}
