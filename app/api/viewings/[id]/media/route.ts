import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { appendViewingMediaPath } from "@/lib/collaboration/server";
import {
  assertAllowedKeys,
  optionalEnum,
  optionalString,
  readJsonObject,
  RequestValidationError,
  validationErrorBody,
} from "@/lib/http/validation";

export const runtime = "nodejs";

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
    const body = await readJsonObject(request);
    assertAllowedKeys(body, ["column", "path"]);
    const column = optionalEnum(
      body,
      "column",
      ["photo_urls", "video_urls", "audio_urls"] as const,
    );
    const path = optionalString(body, "path", { min: 1, max: 1024 });
    if (!column || !path) {
      return NextResponse.json({ error: "INVALID_MEDIA_COLUMN" }, { status: 400 });
    }
    const result = await appendViewingMediaPath({
      viewingId: id,
      actor: user,
      column,
      path,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return NextResponse.json(validationErrorBody(error), { status: 400 });
    }
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

