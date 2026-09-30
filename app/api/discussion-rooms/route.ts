import { NextResponse } from "next/server";
import { compareKey, normalizeCompareItemIds } from "@/lib/comparison/compare-key";
import { FREE_COMPARE_MAX_ITEMS, PRO_COMPARE_MAX_ITEMS } from "@/lib/comparison/entitlement";
import { getAccountTier } from "@/lib/entitlement/tier";
import { createSessionCode } from "@/lib/viewing-session-code";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { viewingIds?: unknown } | null;
  const rawIds = Array.isArray(body?.viewingIds) ? body.viewingIds : null;
  if (!rawIds || rawIds.some((id) => typeof id !== "string")) {
    return NextResponse.json({ code: "invalid_request" }, { status: 400, headers });
  }
  const viewingIds = normalizeCompareItemIds(rawIds);
  if (!viewingIds || viewingIds.length < 2) {
    return NextResponse.json({ code: "invalid_request" }, { status: 400, headers });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ code: "login_required" }, { status: 401, headers });

  const admin = createAdminClient();
  let tier: "free" | "pro";
  try {
    tier = await getAccountTier(admin, user.id);
  } catch {
    return NextResponse.json({ code: "entitlement_unavailable" }, { status: 503, headers });
  }
  const maxItems = tier === "pro" ? PRO_COMPARE_MAX_ITEMS : FREE_COMPARE_MAX_ITEMS;

  const { data: owned, error: ownedError } = await admin
    .from("viewings")
    .select("id")
    .eq("user_id", user.id)
    .in("id", viewingIds);
  if (ownedError) return NextResponse.json({ code: "entitlement_unavailable" }, { status: 503, headers });
  if ((owned ?? []).length !== viewingIds.length) {
    return NextResponse.json({ code: "invalid_request" }, { status: 400, headers });
  }

  const { data, error } = await admin.rpc("start_compare_session", {
    p_user_id: user.id,
    p_compare_key: compareKey(user.id, "viewings_list", viewingIds),
    p_item_count: viewingIds.length,
    p_source: "viewings_list",
    p_is_pro: tier === "pro",
    p_free_max: FREE_COMPARE_MAX_ITEMS,
    p_pro_max: PRO_COMPARE_MAX_ITEMS,
    p_daily_new_cap: Number(process.env.COMPARE_DAILY_NEW_CAP ?? 100),
  });
  if (error || !data) return NextResponse.json({ code: "entitlement_unavailable" }, { status: 503, headers });
  const row = (Array.isArray(data) ? data[0] : data) as { outcome: string };
  if (row.outcome === "too_many_items") {
    return NextResponse.json({ code: "too_many_items", tier, maxItems }, { status: 400, headers });
  }
  if (row.outcome === "upgrade_required") {
    return NextResponse.json({ code: "upgrade_required", tier, maxItems }, { status: 402, headers });
  }
  if (row.outcome === "rate_limited") {
    return NextResponse.json({ code: "rate_limited" }, { status: 429, headers });
  }
  if (row.outcome !== "created" && row.outcome !== "reopened") {
    return NextResponse.json({ code: "entitlement_unavailable" }, { status: 503, headers });
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const shareCode = createSessionCode();
    const inserted = await admin
      .from("discussion_rooms")
      .insert({
        owner_user_id: user.id,
        viewing_ids: viewingIds,
        share_code: shareCode,
        title: "比較討論",
      })
      .select("share_code")
      .single();
    if (!inserted.error && inserted.data?.share_code) {
      return NextResponse.json({ shareCode: inserted.data.share_code, path: `/d/${inserted.data.share_code}` }, { headers });
    }
    if (!inserted.error?.message.includes("discussion_rooms_share_code_key")) {
      return NextResponse.json({ code: "entitlement_unavailable" }, { status: 503, headers });
    }
  }
  return NextResponse.json({ code: "entitlement_unavailable" }, { status: 503, headers });
}
