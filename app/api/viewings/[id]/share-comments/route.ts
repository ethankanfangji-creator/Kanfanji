import { NextResponse } from "next/server";
import {
  assertOwnedViewing,
  listShareCommentsForViewing,
} from "@/lib/share-access/comments";
import { createClient } from "@/utils/supabase/server";

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
    if (!(await assertOwnedViewing(supabase, user.id, id))) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const comments = await listShareCommentsForViewing(id);
    return NextResponse.json({ comments });
  } catch (error) {
    const message = error instanceof Error ? error.message : "LOAD_FAILED";
    return NextResponse.json(
      { error: message },
      { status: message === "FORBIDDEN" ? 403 : 500 },
    );
  }
}
