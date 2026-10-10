import { NextResponse } from "next/server";
import { closeAllOwnerShareLinksForViewing } from "@/lib/share-access/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { viewingId?: unknown };
    const viewingId =
      typeof body.viewingId === "string" ? body.viewingId.trim() : "";
    if (!viewingId) {
      return NextResponse.json({ error: "VIEWING_REQUIRED" }, { status: 400 });
    }
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }
    const links = await closeAllOwnerShareLinksForViewing(
      createAdminClient(),
      user.id,
      viewingId,
    );
    return NextResponse.json({ links, closedCount: links.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "停止分享失敗";
    const status = message === "VIEWING_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
