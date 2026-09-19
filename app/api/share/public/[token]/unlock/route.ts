import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  fetchShareGateByTokenAdmin,
  gateFromViewing,
  getShareAccess,
  verifyViewingSharePassword,
} from "@/lib/share-access/server";
import {
  createShareUnlockCookieValue,
  shareUnlockCookieName,
} from "@/lib/share-access/cookie";
import { isShareTokenFormat, shareTokenFingerprint } from "@/lib/share-access";
import type { UnlockShareRequest } from "@/lib/share-access/types";
import {
  MAX_SHARE_PASSWORD_LENGTH,
  shareUnlockRateLimitKey,
  SupabaseShareUnlockRateLimiter,
} from "@/lib/share-access/rate-limit";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!isShareTokenFormat(token)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  }

  let body: UnlockShareRequest;
  try {
    body = (await req.json()) as UnlockShareRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length === 0 || password.length > MAX_SHARE_PASSWORD_LENGTH) {
    return NextResponse.json({ error: "Invalid password length" }, { status: 400 });
  }
  // Never log password or include in response.
  void shareTokenFingerprint(token);

  try {
    const admin = createAdminClient();
    const clientId = (req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown")
      .trim()
      .slice(0, 128);
    const limiter = new SupabaseShareUnlockRateLimiter(admin);
    const rate = await limiter.consume(
      shareUnlockRateLimitKey(shareTokenFingerprint(token), clientId),
    );
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "嘗試次數過多，請稍後再試" },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSeconds) },
        },
      );
    }
    const viewing = await fetchShareGateByTokenAdmin(admin, token);
    const gate = gateFromViewing(viewing, false);
    if (gate === "missing") {
      return NextResponse.json({ error: "找不到分享" }, { status: 404 });
    }
    if (gate === "revoked" || gate === "expired") {
      return NextResponse.json({ error: gate }, { status: 410 });
    }
    if (!viewing) {
      return NextResponse.json({ error: "找不到分享" }, { status: 404 });
    }
    const ok = await verifyViewingSharePassword(viewing, password);
    if (!ok) {
      return NextResponse.json({ error: "密碼錯誤" }, { status: 401 });
    }
    const access = getShareAccess(viewing);
    if (!access) {
      return NextResponse.json({ error: "找不到分享" }, { status: 404 });
    }
    const { value, expiresAt } = createShareUnlockCookieValue(
      token,
      access.access_version,
      { linkExpiresAt: access.expires_at },
    );
    const res = NextResponse.json({
      ok: true as const,
      expiresAt: expiresAt.toISOString(),
    });
    res.cookies.set(shareUnlockCookieName(token), value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    return res;
  } catch (error) {
    const message = error instanceof Error ? error.message : "解鎖失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
