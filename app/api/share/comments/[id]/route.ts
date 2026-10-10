import { NextResponse } from "next/server";
import { deleteOwnerShareComment } from "@/lib/share-access/comments";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const commentId = id?.trim();
    if (!commentId) {
      return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
    }
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }
    const deleted = await deleteOwnerShareComment(supabase, user.id, commentId);
    if (!deleted) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "DELETE_FAILED" }, { status: 503 });
  }
}
