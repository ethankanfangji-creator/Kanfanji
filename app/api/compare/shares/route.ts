import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { parseCompareShareSnapshot } from "@/lib/comparison/share-schema";
import { FREE_COMPARE_MAX_ITEMS, PRO_COMPARE_MAX_ITEMS } from "@/lib/comparison/entitlement";
import { getAccountTier } from "@/lib/entitlement/tier";
import { serverTrack } from "@/lib/analytics/server";
import { assertAllowedKeys, readJsonObject } from "@/lib/http/validation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ code: "login_required" }, { status: 401, headers });
  const compareId = new URL(request.url).searchParams.get("compareId");
  const admin = createAdminClient();
  const { data } = await admin
    .from("compare_shares")
    .select("id, status, expires_at, created_at")
    .eq("user_id", user.id)
    .eq("compare_id", compareId ?? "");
  return NextResponse.json({
    shares: (data ?? []).map((row) => ({
      id: row.id,
      status: row.status,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    })),
  }, { headers });
}

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ code: "invalid_request" }, { status: 400, headers });
  try {
    assertAllowedKeys(body, ["compareId", "snapshot", "acknowledgeAddresses"]);
  } catch {
    return NextResponse.json({ code: "invalid_request" }, { status: 400, headers });
  }
  if (body.acknowledgeAddresses !== true) {
    return NextResponse.json({ code: "invalid_request" }, { status: 400, headers });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ code: "login_required" }, { status: 401, headers });
  const admin = createAdminClient();
  let tier: "free" | "pro";
  try {
    tier = await getAccountTier(admin, user.id);
  } catch {
    return NextResponse.json({ code: "entitlement_unavailable" }, { status: 503, headers });
  }
  let snapshot;
  try {
    const columns = Array.isArray((body.snapshot as { columns?: unknown })?.columns)
      ? (body.snapshot as { columns: unknown[] }).columns.length
      : 0;
    snapshot = parseCompareShareSnapshot(body.snapshot, columns);
  } catch {
    return NextResponse.json({ code: "invalid_request" }, { status: 400, headers });
  }
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const ttlDays = Number(process.env.COMPARE_SHARE_TTL_DAYS ?? 30);
  const { data, error } = await admin.rpc("create_compare_share", {
    p_user_id: user.id,
    p_compare_id: body.compareId,
    p_token_hash: tokenHash,
    p_snapshot: snapshot,
    p_column_count: snapshot.columns.length,
    p_is_pro: tier === "pro",
    p_free_max: FREE_COMPARE_MAX_ITEMS,
    p_pro_max: PRO_COMPARE_MAX_ITEMS,
    p_ttl_seconds: ttlDays * 86_400,
    p_hourly_cap: 10,
    p_active_cap: 50,
  });
  if (error || !data) return NextResponse.json({ code: "entitlement_unavailable" }, { status: 503, headers });
  const row = (Array.isArray(data) ? data[0] : data) as { outcome: string; share_id: string; expires_at: string };
  if (row.outcome === "not_found") return NextResponse.json({ code: "not_found" }, { status: 404, headers });
  if (row.outcome === "upgrade_required") return NextResponse.json({ code: "upgrade_required" }, { status: 402, headers });
  if (row.outcome === "too_many_items") return NextResponse.json({ code: "too_many_items" }, { status: 400, headers });
  if (row.outcome === "rate_limited") return NextResponse.json({ code: "rate_limited" }, { status: 429, headers });
  const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  void serverTrack(user.id, { name: "share_created", props: { kind: "compare" } });
  return NextResponse.json(
    { shareId: row.share_id, url: `${site}/c/${token}`, expiresAt: row.expires_at },
    { status: 201, headers },
  );
}
