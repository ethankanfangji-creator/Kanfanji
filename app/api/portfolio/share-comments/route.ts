import { NextResponse } from "next/server";
import {
  filterOwnedViewingIds,
  listShareCommentsForViewings,
} from "@/lib/share-access/comments";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

const VIEWING_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const body = (await request.json()) as { viewingIds?: unknown };
    const requested = Array.isArray(body.viewingIds)
      ? body.viewingIds
          .filter((id): id is string => typeof id === "string" && VIEWING_ID_RE.test(id.trim()))
          .map((id) => id.trim())
          .slice(0, 40)
      : [];

    if (requested.length === 0) {
      return NextResponse.json({ commentsByViewingId: {} });
    }

    const owned = await filterOwnedViewingIds(supabase, user.id, requested);
    const commentsByViewingId = await listShareCommentsForViewings(owned);
    return NextResponse.json({ commentsByViewingId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "LOAD_FAILED";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
