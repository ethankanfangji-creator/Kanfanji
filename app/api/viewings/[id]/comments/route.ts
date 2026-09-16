import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  addViewingComment,
  getCollaborationOverview,
} from "@/lib/collaboration/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    const overview = await getCollaborationOverview(id, user);
    return NextResponse.json({ comments: overview.comments, role: overview.role });
  } catch (error) {
    const message = error instanceof Error ? error.message : "LOAD_FAILED";
    return NextResponse.json(
      { error: message },
      { status: message === "FORBIDDEN" ? 403 : 500 },
    );
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    const body = (await request.json()) as {
      body?: string;
      anchor?: Record<string, unknown> | null;
    };
    const comment = await addViewingComment({
      viewingId: id,
      actor: user,
      body: body.body ?? "",
      anchor: body.anchor,
    });
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "COMMENT_FAILED";
    return NextResponse.json(
      { error: message },
      {
        status:
          message === "FORBIDDEN"
            ? 403
            : message === "INVALID_COMMENT"
              ? 400
              : 500,
      },
    );
  }
}

