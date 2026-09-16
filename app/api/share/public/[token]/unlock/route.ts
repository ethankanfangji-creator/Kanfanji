import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  fetchViewingByShareTokenAdmin,
  gateFromViewing,
  verifyViewingSharePassword,
} from "@/lib/share-access/server";
import {
  createShareUnlockCookieValue,
  shareUnlockCookieName,
} from "@/lib/share-access/cookie";
import { isShareTokenFormat, shareTokenFingerprint } from "@/lib/share-access";
import type { UnlockShareRequest } from "@/lib/share-access/types";

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
  // Never log password or include in response.
  void shareTokenFingerprint(token);

  try {
    const admin = createAdminClient();
    const viewing = await fetchViewingByShareTokenAdmin(admin, token);
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
    const { value, expiresAt } = createShareUnlockCookieValue(token);
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
