import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { MEDIA_BUCKET } from "@/lib/supabase";
import { toStoragePath } from "@/lib/media-paths";
import {
  assertOwnerMediaPath,
  MEDIA_SIGNED_TTL_SECONDS,
} from "@/lib/media-sign";
import {
  assertAllowedKeys,
  readJsonObject,
  RequestValidationError,
  validationErrorBody,
} from "@/lib/http/validation";

export const runtime = "nodejs";

/**
 * POST /api/media/sign
 * Body: { paths: string[], expiresIn?: number }
 * Returns short-TTL signed URLs for private viewing-media objects owned by the user.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const body = await readJsonObject(request);
    assertAllowedKeys(body, ["paths", "expiresIn"]);
    const pathsRaw = body.paths;
    if (!Array.isArray(pathsRaw) || pathsRaw.length === 0 || pathsRaw.length > 40) {
      return NextResponse.json({ error: "INVALID_PATHS" }, { status: 400 });
    }
    let expiresIn = MEDIA_SIGNED_TTL_SECONDS;
    if (body.expiresIn !== undefined) {
      const n = typeof body.expiresIn === "number" ? body.expiresIn : Number(body.expiresIn);
      if (!Number.isFinite(n) || n < 60 || n > MEDIA_SIGNED_TTL_SECONDS) {
        return NextResponse.json({ error: "INVALID_EXPIRES_IN" }, { status: 400 });
      }
      expiresIn = Math.floor(n);
    }

    const paths: string[] = [];
    for (const item of pathsRaw) {
      if (typeof item !== "string") {
        return NextResponse.json({ error: "INVALID_PATHS" }, { status: 400 });
      }
      const path = toStoragePath(item);
      if (!path) {
        return NextResponse.json({ error: "INVALID_MEDIA_PATH" }, { status: 400 });
      }
      assertOwnerMediaPath(path, user.id);
      paths.push(path);
    }

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(MEDIA_BUCKET)
      .createSignedUrls(paths, expiresIn);
    if (error || !data) {
      return NextResponse.json({ error: "SIGN_FAILED" }, { status: 500 });
    }

    const urls = data.map((row) => row.signedUrl).filter((u): u is string => Boolean(u));
    return NextResponse.json({
      urls,
      expiresIn,
      bucket: MEDIA_BUCKET,
    });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return NextResponse.json(validationErrorBody(error), { status: 400 });
    }
    const message = error instanceof Error ? error.message : "SIGN_FAILED";
    const status =
      message === "FORBIDDEN" ? 403 : message === "INVALID_MEDIA_PATH" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
