import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clientIp } from "@/lib/ai-boundary/quota";
import { isShareTokenFormat } from "@/lib/share-access";
import {
  consumeShareCommentRateLimit,
  insertShareComment,
  listShareCommentsForLink,
  normalizeCommentAuthor,
  normalizeCommentBody,
  optionalClientHash,
  resolveActiveShareForComments,
} from "@/lib/share-access/comments";
import {
  shareUnlockCookieName,
  verifyShareUnlockCookieValue,
} from "@/lib/share-access/cookie";
import {
  fetchShareGateByTokenAdmin,
  getShareAccess,
} from "@/lib/share-access/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

const headers = { "Cache-Control": "no-store" };

async function isUnlocked(token: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const gateRow = await fetchShareGateByTokenAdmin(admin, token);
    if (!gateRow) return false;
    if (!gateRow.shareLink.password_hash) return true;
    const access = getShareAccess(gateRow);
    const jar = await cookies();
    return verifyShareUnlockCookieValue(
      token,
      access.access_version,
      jar.get(shareUnlockCookieName(token))?.value,
    );
  } catch {
    return false;
  }
}

function statusCode(
  status: "missing" | "revoked" | "expired" | "password_required" | "forbidden",
): number {
  if (status === "missing") return 404;
  if (status === "password_required") return 401;
  if (status === "expired" || status === "revoked") return 410;
  return 403;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!isShareTokenFormat(token)) {
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 404, headers });
  }
  const resolved = await resolveActiveShareForComments(token, await isUnlocked(token));
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.status.toUpperCase() },
      { status: statusCode(resolved.status), headers },
    );
  }
  try {
    const comments = await listShareCommentsForLink(resolved.shareLinkId);
    return NextResponse.json({ comments }, { headers });
  } catch {
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 503, headers });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!isShareTokenFormat(token)) {
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 404, headers });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers });
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const commentBody = normalizeCommentBody(record.body);
  if (!commentBody) {
    return NextResponse.json({ error: "INVALID_COMMENT" }, { status: 400, headers });
  }
  const authorLabel = normalizeCommentAuthor(record.authorLabel, "訪客");
  const clientHash = optionalClientHash(record.clientHash);

  try {
    const limited = await consumeShareCommentRateLimit(clientIp(req), token);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "RATE_LIMITED" },
        {
          status: 429,
          headers: { ...headers, "Retry-After": String(limited.retryAfterSec) },
        },
      );
    }

    const resolved = await resolveActiveShareForComments(token, await isUnlocked(token));
    if (!resolved.ok) {
      return NextResponse.json(
        { error: resolved.status.toUpperCase() },
        { status: statusCode(resolved.status), headers },
      );
    }

    const comment = await insertShareComment({
      viewingId: resolved.viewingId,
      shareLinkId: resolved.shareLinkId,
      authorLabel,
      body: commentBody,
      clientHash,
    });
    return NextResponse.json({ comment }, { status: 201, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "COMMENT_FAILED";
    if (message === "SHARE_UNAVAILABLE") {
      return NextResponse.json({ error: message }, { status: 503, headers });
    }
    return NextResponse.json({ error: "COMMENT_FAILED" }, { status: 503, headers });
  }
}
