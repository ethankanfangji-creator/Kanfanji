import { NextResponse } from "next/server";
import { deleteSavedShare, listSavedShares } from "@/lib/share-access/saves";
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
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() || undefined;
    const limitRaw = Number(url.searchParams.get("limit") ?? 100);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 100;
    const admin = createAdminClient();
    const items = await listSavedShares(admin, user.id, { q, limit });
    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "載入失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }
    const url = new URL(req.url);
    const id = url.searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json({ error: "missing_id" }, { status: 400 });
    }
    const admin = createAdminClient();
    const removed = await deleteSavedShare(admin, user.id, id);
    if (!removed) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(
      { removed: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "刪除失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
