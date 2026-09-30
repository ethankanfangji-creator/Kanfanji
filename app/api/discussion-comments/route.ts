import { NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { isLiveCode } from "@/lib/viewing-session-code";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

const VOTES = new Set(["like", "meh", "dislike"]);
const headers = { "Cache-Control": "no-store" };

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    shareCode?: unknown;
    cardId?: unknown;
    nickname?: unknown;
    content?: unknown;
    vote?: unknown;
  } | null;
  const shareCode = typeof body?.shareCode === "string" ? body.shareCode : "";
  const nickname = typeof body?.nickname === "string" ? body.nickname.replace(/\s+/g, " ").trim() : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  const vote = typeof body?.vote === "string" ? body.vote : "";
  const cardId = typeof body?.cardId === "string" && body.cardId ? body.cardId : null;
  if (!isLiveCode(shareCode) || nickname.length < 1 || nickname.length > 24) {
    return NextResponse.json({ code: "invalid_request" }, { status: 400, headers });
  }
  if (!content && !VOTES.has(vote)) {
    return NextResponse.json({ code: "invalid_request" }, { status: 400, headers });
  }
  if (content.length > 500 || (vote && !VOTES.has(vote))) {
    return NextResponse.json({ code: "invalid_request" }, { status: 400, headers });
  }

  const limited = consumeRateLimit(`discussion:${clientIp(request)}:${shareCode}`, {
    limit: 8,
    windowMs: 10 * 60 * 1000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { code: "rate_limited" },
      { status: 429, headers: { ...headers, "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  const admin = createAdminClient();
  const { data: room, error: roomError } = await admin
    .from("discussion_rooms")
    .select("id, viewing_ids")
    .eq("share_code", shareCode)
    .maybeSingle();
  if (roomError) return NextResponse.json({ code: "unavailable" }, { status: 503, headers });
  if (!room) return NextResponse.json({ code: "not_found" }, { status: 404, headers });

  if (cardId) {
    const { data: card, error: cardError } = await admin
      .from("viewing_cards")
      .select("id, viewing_id")
      .eq("id", cardId)
      .maybeSingle();
    if (cardError) return NextResponse.json({ code: "unavailable" }, { status: 503, headers });
    const viewingIds = Array.isArray(room.viewing_ids) ? room.viewing_ids : [];
    if (!card || !viewingIds.includes(card.viewing_id)) {
      return NextResponse.json({ code: "invalid_request" }, { status: 400, headers });
    }
  }

  const { error } = await admin.from("discussion_comments").insert({
    room_id: room.id,
    card_id: cardId,
    nickname,
    content: content || null,
    vote: vote || null,
  });
  if (error) return NextResponse.json({ code: "unavailable" }, { status: 503, headers });
  return NextResponse.json({ ok: true }, { headers });
}
