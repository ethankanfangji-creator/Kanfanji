import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/billing-guards";
import { isActiveSubscriptionStatus } from "@/lib/billing-status";
import { throwOnSupabaseError } from "@/lib/supabase-write";
import {
  canCreateViewing,
  FREE_VIEWING_LIMIT,
} from "@/lib/viewing-entitlement";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

type CreateViewingBody = {
  address?: string;
  tags?: string[];
  market?: string | null;
  questions?: unknown;
  property?: Record<string, unknown>;
  property_id?: string | null;
};

/**
 * Controlled create path for viewings.
 * Guests never create cloud rows (login required) — same as prior ClientPage behavior.
 * Entitlement uses subscriptions.status + viewings count; never viewings.is_pro for authz.
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
          .select("status")
          .eq("user_id", user!.id)
          .maybeSingle(),
      ]);
    throwOnSupabaseError(countError, "viewings count");
    throwOnSupabaseError(subError, "subscriptions lookup");

    const isPro = isActiveSubscriptionStatus(sub?.status);
    const freeCount = count ?? 0;
    const decision = canCreateViewing({ isPro, freeCount });
    if (!decision.ok) {
      return NextResponse.json(
        {
          error: `免費額度已用完（${FREE_VIEWING_LIMIT} 間）`,
          code: decision.code,
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
      property: body.property ?? {},
      property_id: body.property_id ?? null,
      user_id: user!.id,
      is_pro: isPro,
      photo_urls: [] as string[],
      video_urls: [] as string[],
      updated_at: new Date().toISOString(),
    };

    let { data, error } = await admin
      .from("viewings")
      .insert(payload)
      .select("id")
      .single();

    if (error?.message?.includes("property_id")) {
      const withoutPropertyId = { ...payload };
      delete (withoutPropertyId as { property_id?: string | null }).property_id;
      ({ data, error } = await admin
        .from("viewings")
        .insert(withoutPropertyId)
        .select("id")
        .single());
    }
    if (error?.message?.includes("property")) {
      const withoutProperty = { ...payload };
      delete (withoutProperty as { property?: Record<string, unknown> }).property;
      delete (withoutProperty as { property_id?: string | null }).property_id;
      ({ data, error } = await admin
        .from("viewings")
        .insert(withoutProperty)
        .select("id")
        .single());
    }
    throwOnSupabaseError(error, "viewings insert");
    if (!data?.id) {
      return NextResponse.json({ error: "存檔失敗：沒有回傳 id" }, { status: 500 });
    }

    return NextResponse.json({ id: data.id, isPro, freeCount: freeCount + 1 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "建立看房紀錄失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
