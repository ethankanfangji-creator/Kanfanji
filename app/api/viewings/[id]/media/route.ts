import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { appendViewingMediaPath } from "@/lib/collaboration/server";

export const runtime = "nodejs";

type MediaColumn = "photo_urls" | "video_urls" | "audio_urls";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
      column?: MediaColumn;
      path?: string;
    };
    if (
      !body.column ||
      !["photo_urls", "video_urls", "audio_urls"].includes(body.column)
    ) {
      return NextResponse.json({ error: "INVALID_MEDIA_COLUMN" }, { status: 400 });
    }
    const result = await appendViewingMediaPath({
      viewingId: id,
      actor: user,
      column: body.column,
      path: body.path ?? "",
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "MEDIA_APPEND_FAILED";
    const status =
      message === "FORBIDDEN"
        ? 403
        : message === "INVALID_MEDIA_PATH"
          ? 400
          : message === "VIEWING_NOT_FOUND"
            ? 404
            : message === "REVISION_CONFLICT"
              ? 409
              : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

