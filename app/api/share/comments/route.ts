import { NextResponse } from "next/server";
import { listOwnerShareCommentsAcrossViewings } from "@/lib/share-access/comments";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() || undefined;
    const viewingId = url.searchParams.get("viewingId")?.trim() || undefined;
    const limitRaw = Number(url.searchParams.get("limit") ?? 100);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 100;

    const items = await listOwnerShareCommentsAcrossViewings(createAdminClient(), user.id, {
      q,
      viewingId,
      limit,
    });
    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "LOAD_FAILED";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
