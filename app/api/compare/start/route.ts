import { NextResponse } from "next/server";
import { compareKey, normalizeCompareItemIds } from "@/lib/comparison/compare-key";
import { FREE_COMPARE_MAX_ITEMS, PRO_COMPARE_MAX_ITEMS } from "@/lib/comparison/entitlement";
import { getAccountTier } from "@/lib/entitlement/tier";
import { assertAllowedKeys, readJsonObject } from "@/lib/http/validation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

/**
 * Records a comparison attempt. Only a hash, count, and source are stored.
 * Item contents and addresses are never read here.
 */
export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ code: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    assertAllowedKeys(body, ["source", "itemIds"]);
  } catch {
    return NextResponse.json({ code: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const source = body.source;
  const itemIds = body.itemIds;
  if ((source !== "chat_history" && source !== "viewings_list") || !Array.isArray(itemIds) || itemIds.some((id) => typeof id !== "string")) {
    return NextResponse.json({ code: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const ids = normalizeCompareItemIds(itemIds);
  if (!ids || ids.length < 2) {
    return NextResponse.json({ code: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (ids.length > PRO_COMPARE_MAX_ITEMS) {
    return NextResponse.json(
      { code: "too_many_items", maxItems: PRO_COMPARE_MAX_ITEMS },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ code: "login_required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const admin = createAdminClient();
  let tier: "free" | "pro";
  try {
    tier = await getAccountTier(admin, user.id);
  } catch {
    return NextResponse.json({ code: "entitlement_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const key = compareKey(user.id, source, ids);
  const { data, error } = await admin.rpc("start_compare_session", {
    p_user_id: user.id,
    p_compare_key: key,
    p_item_count: ids.length,
    p_source: source,
    p_is_pro: tier === "pro",
    p_free_max: FREE_COMPARE_MAX_ITEMS,
    p_pro_max: PRO_COMPARE_MAX_ITEMS,
    p_daily_new_cap: Number(process.env.COMPARE_DAILY_NEW_CAP ?? 100),
  });
  if (error || !data) {
    return NextResponse.json({ code: "entitlement_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const row = (Array.isArray(data) ? data[0] : data) as { outcome: string; compare_id: string | null };
  const maxItems = tier === "pro" ? PRO_COMPARE_MAX_ITEMS : FREE_COMPARE_MAX_ITEMS;
  const headers = { "Cache-Control": "no-store" };
  if (row.outcome === "created" || row.outcome === "reopened") {
    return NextResponse.json(
      { allowed: true, outcome: row.outcome, compareId: row.compare_id, tier, maxItems },
      { headers },
    );
  }
  if (row.outcome === "upgrade_required") {
    return NextResponse.json({ code: "upgrade_required", tier, maxItems }, { status: 402, headers });
  }
  if (row.outcome === "too_many_items") {
    return NextResponse.json({ code: "too_many_items", tier, maxItems }, { status: 400, headers });
  }
  if (row.outcome === "rate_limited") {
    return NextResponse.json({ code: "rate_limited" }, { status: 429, headers });
  }
  return NextResponse.json({ code: "entitlement_unavailable" }, { status: 503, headers });
}
