import { NextResponse } from "next/server";
import { refreshShareMediaUrls } from "@/lib/share";
import { isShareTokenFormat } from "@/lib/share-access";
import {
  assertAllowedKeys,
  readJsonObject,
  RequestValidationError,
  validationErrorBody,
} from "@/lib/http/validation";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

/**
 * POST /api/share/public/[token]/media
 * Body: { paths: string[] }
 * Refreshes short-TTL signed URLs for a published share (after unlock when required).
 */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const { token } = await ctx.params;
    if (!isShareTokenFormat(token)) {
      return NextResponse.json(
        { version: 1, status: "missing", message: "Invalid share token." },
        { status: 404 },
      );
    }

    const body = await readJsonObject(request);
    assertAllowedKeys(body, ["paths"]);
    const pathsRaw = body.paths;
    if (!Array.isArray(pathsRaw) || pathsRaw.length === 0 || pathsRaw.length > 40) {
      return NextResponse.json({ error: "INVALID_PATHS" }, { status: 400 });
    }
    if (pathsRaw.some((item) => typeof item !== "string")) {
      return NextResponse.json({ error: "INVALID_PATHS" }, { status: 400 });
    }

    const result = await refreshShareMediaUrls(token, pathsRaw as string[]);
    if (!result.ok) {
      const failure = result.result;
      const status =
        failure.status === "active"
          ? 200
          : failure.status === "password_required"
            ? 401
            : failure.status === "missing"
              ? 404
              : failure.status === "expired" || failure.status === "revoked"
                ? 410
                : 403;
      return NextResponse.json(failure, { status });
    }

    return NextResponse.json({
      urls: result.urls,
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return NextResponse.json(validationErrorBody(error), { status: 400 });
    }
    return NextResponse.json({ error: "SIGN_FAILED" }, { status: 500 });
  }
}
