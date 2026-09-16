import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/utils/supabase/admin";
import { resolvePublicShare } from "@/lib/share";
import { isShareTokenFormat } from "@/lib/share-access";
import { shareUnlockCookieName } from "@/lib/share-access/cookie";
import { verifyShareUnlockCookieValue } from "@/lib/share-access/cookie";

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
  try {
    // Warm admin path — resolvePublicShare uses cookies + admin.
    createAdminClient();
  } catch {
    // resolve will fall back
  }
  const cookieStore = await cookies();
  const unlocked = verifyShareUnlockCookieValue(
    token,
    cookieStore.get(shareUnlockCookieName(token))?.value,
  );
  const result = await resolvePublicShare(token, { unlocked });
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
