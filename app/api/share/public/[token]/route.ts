import { NextResponse } from "next/server";
import { resolvePublicShare } from "@/lib/share";
import { isShareTokenFormat } from "@/lib/share-access";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!isShareTokenFormat(token)) {
    return NextResponse.json(
      { version: 1, status: "missing", message: "Invalid share token." },
      { status: 404 },
    );
  }
  const result = await resolvePublicShare(token);
  const status =
    result.status === "active"
      ? 200
      : result.status === "password_required"
        ? 401
        : result.status === "missing"
          ? 404
          : result.status === "expired" || result.status === "revoked"
            ? 410
            : 403;
  return NextResponse.json(result, { status });
}
