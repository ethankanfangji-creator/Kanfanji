import { NextResponse } from "next/server";
import {
  insertOwnerShareReply,
  normalizeCommentBody,
} from "@/lib/share-access/comments";
import { emitShareCommentNotification } from "@/lib/notifications/emit";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const parentCommentId = id?.trim();
    if (!parentCommentId) {
      return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const commentBody = normalizeCommentBody(record.body);
    if (!commentBody) {
      return NextResponse.json({ error: "INVALID_COMMENT" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }

    const comment = await insertOwnerShareReply({
      supabase,
      userId: user.id,
      parentCommentId,
      body: commentBody,
      ownerLabelFallback: "主人",
    });

    emitShareCommentNotification({
      viewingId: comment.viewingId,
      shareLinkId: comment.shareLinkId,
      commentId: comment.id,
      authorLabel: comment.authorLabel,
      bodyPreview: comment.body,
      parentId: comment.parentId,
    });

    return NextResponse.json(
      { comment },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "COMMENT_FAILED";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (
      message === "PARENT_NOT_FOUND" ||
      message === "PARENT_MISMATCH" ||
      message === "DEPTH_EXCEEDED"
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: "COMMENT_FAILED" }, { status: 503 });
  }
}
