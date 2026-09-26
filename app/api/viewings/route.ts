import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getViewingRole } from "@/lib/collaboration/server";
import {
  projectViewingForRole,
  VIEWING_PROJECTION_SELECT,
} from "@/lib/collaboration/projection";
import { requireAuthenticatedUser } from "@/lib/billing-guards";
import { resolveProEntitlement } from "@/lib/billing-status";
import { serverTrack } from "@/lib/analytics/server";
import { throwOnSupabaseError } from "@/lib/supabase-write";
import {
  canCreateCloudViewing,
  FREE_VIEWING_LIMIT,
} from "@/lib/viewing-wizard/free-tier";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const { data: rows, error } = await supabase
      .from("viewings")
      .select("id")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    const ids = (rows ?? []).map((row) => String(row.id));
    if (ids.length === 0) return NextResponse.json({ viewings: [] });

    const { data: fullRows, error: fullRowsError } = await createAdminClient()
      .from("viewings")
      .select(VIEWING_PROJECTION_SELECT)
      .in("id", ids);
    if (fullRowsError) throw fullRowsError;
    const safeFullRows = (fullRows ?? []) as unknown as Record<string, unknown>[];
    const byId = new Map(safeFullRows.map((row) => [String(row.id), row]));
    const roles = await Promise.all(ids.map((id) => getViewingRole(id, user.id)));

    return NextResponse.json({
      viewings: ids.flatMap((id, index) => {
        const row = byId.get(id);
        const role = roles[index];
        return row && role ? [projectViewingForRole(row, role)] : [];
      }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "LOAD_FAILED" },
      { status: 500 },
    );
  }
}

type CreateViewingBody = {
  address?: string;
  tags?: string[];
  market?: string | null;
  questions?: unknown;
  notes?: unknown;
  pros?: string[];
  risks?: string[];
  property?: Record<string, unknown>;
  property_id?: string | null;
  idempotency_key?: string;
  client_updated_at?: string;
};

/**
 * Controlled create path for viewings (service role).
 * Guests never create cloud rows (login required).
 * Entitlement uses subscriptions.status + viewings count — never viewings.is_pro for authz.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const authFail = requireAuthenticatedUser(user);
    if (authFail) {
      return NextResponse.json(
        { error: authFail.error, code: authFail.code },
        { status: authFail.status },
      );
    }

    let body: CreateViewingBody;
    try {
      body = (await request.json()) as CreateViewingBody;
    } catch {
      return NextResponse.json(
        { error: "無效的 JSON", code: "INVALID_BODY" },
        { status: 400 },
      );
    }

    const address = typeof body.address === "string" ? body.address.trim() : "";
    if (!address) {
      return NextResponse.json(
        { error: "地址必填", code: "ADDRESS_REQUIRED" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const [{ count, error: countError }, { data: sub, error: subError }] =
      await Promise.all([
        admin
          .from("viewings")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id),
        admin
          .from("subscriptions")
          .select("status, manual_pro_until")
          .eq("user_id", user!.id)
          .maybeSingle(),
      ]);
    throwOnSupabaseError(countError, "viewings count");
    throwOnSupabaseError(subError, "subscriptions lookup");

    const isPro = resolveProEntitlement({
      status: sub?.status,
      manual_pro_until: sub?.manual_pro_until,
    });
    const freeCount = count ?? 0;
    const decision = canCreateCloudViewing({
      viewingId: null,
      freeCount,
      isPro,
      authenticated: true,
    });
    if (!decision.allowed) {
      return NextResponse.json(
        {
          error: `免費額度已用完（${FREE_VIEWING_LIMIT} 間）`,
          code: "FREE_LIMIT_REACHED",
          freeCount,
          limit: FREE_VIEWING_LIMIT,
        },
        { status: 402 },
      );
    }

    const payload = {
      address,
      tags: Array.isArray(body.tags) ? body.tags : [],
      market: body.market ?? null,
      questions: body.questions ?? [],
      notes: body.notes ?? [],
      pros: Array.isArray(body.pros) ? body.pros : [],
      risks: Array.isArray(body.risks) ? body.risks : [],
      property: body.property ?? {},
      property_id: body.property_id ?? null,
      user_id: user!.id,
      is_pro: isPro,
      photo_urls: [] as string[],
      video_urls: [] as string[],
      audio_urls: [] as string[],
      revision: 1,
      updated_at: new Date().toISOString(),
      ...(body.idempotency_key ? { idempotency_key: body.idempotency_key } : {}),
      ...(body.client_updated_at
        ? { client_updated_at: body.client_updated_at }
        : {}),
    };

    let { data, error } = await admin
      .from("viewings")
      .insert(payload)
      .select("id, revision")
      .single();

    if (error?.message?.includes("property_id")) {
      const withoutPropertyId = { ...payload };
      delete (withoutPropertyId as { property_id?: string | null }).property_id;
      ({ data, error } = await admin
        .from("viewings")
        .insert(withoutPropertyId)
        .select("id, revision")
        .single());
    }
    if (error?.message?.includes("property")) {
      const withoutProperty = { ...payload };
      delete (withoutProperty as { property?: Record<string, unknown> }).property;
      delete (withoutProperty as { property_id?: string | null }).property_id;
      ({ data, error } = await admin
        .from("viewings")
        .insert(withoutProperty)
        .select("id, revision")
        .single());
    }
    throwOnSupabaseError(error, "viewings insert");
    if (!data?.id) {
      return NextResponse.json({ error: "存檔失敗：沒有回傳 id" }, { status: 500 });
    }

    const market =
      body.market === "US" ||
      body.market === "CA" ||
      body.market === "TW" ||
      body.market === "OTHER"
        ? body.market
        : "OTHER";
    await serverTrack(user!.id, {
      name: "viewing_created",
      props: { storage: "cloud", market },
    });

    return NextResponse.json({
      id: data.id,
      revision: data.revision ?? 1,
      isPro,
      freeCount: freeCount + 1,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "建立看房紀錄失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
