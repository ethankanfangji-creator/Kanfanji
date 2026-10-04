import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { normalizeSession, type PortfolioSession } from "@/lib/portfolio";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toClientSession(
  session: {
    id: string;
    title: string;
    scope: unknown;
    created_at: string;
    updated_at: string;
  },
  turns: Array<{
    id: string;
    role: string;
    content: string;
    matched_ids: string[] | null;
    citations: unknown;
    suggest_compare: boolean | null;
    feedback: string | null;
    feedback_reason: string | null;
    created_at: string;
  }>,
): PortfolioSession | null {
  return normalizeSession({
    id: session.id,
    title: session.title,
    scope: session.scope,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    cloudSyncedAt: session.updated_at,
    turns: turns.map((turn) => ({
      id: turn.id,
      role: turn.role,
      text: turn.content,
      createdAt: turn.created_at,
      matchedIds: turn.matched_ids ?? [],
      citations: turn.citations,
      suggestCompare: Boolean(turn.suggest_compare),
      feedback: turn.feedback,
      feedbackReason: turn.feedback_reason,
    })),
  });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ sessions: [] });
  }

  const { data: sessions, error } = await supabase
    .from("portfolio_ask_sessions")
    .select("id, title, scope, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(40);
  if (error) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const ids = (sessions ?? []).map((row) => row.id);
  type TurnRow = {
    id: string;
    session_id: string;
    role: string;
    content: string;
    matched_ids: string[] | null;
    citations: unknown;
    suggest_compare: boolean | null;
    feedback: string | null;
    feedback_reason: string | null;
    created_at: string;
    sort_index: number;
  };
  const turnsBySession = new Map<string, TurnRow[]>();
  if (ids.length > 0) {
    const { data: turnRows, error: turnError } = await supabase
      .from("portfolio_ask_turns")
      .select(
        "id, session_id, role, content, matched_ids, citations, suggest_compare, feedback, feedback_reason, created_at, sort_index",
      )
      .eq("user_id", user.id)
      .in("session_id", ids)
      .order("sort_index", { ascending: true });
    if (turnError) {
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    }
    for (const turn of turnRows ?? []) {
      const list = turnsBySession.get(turn.session_id) ?? [];
      list.push(turn);
      turnsBySession.set(turn.session_id, list);
    }
  }

  const payload = (sessions ?? [])
    .map((session) => toClientSession(session, turnsBySession.get(session.id) ?? []))
    .filter((row): row is PortfolioSession => Boolean(row));

  return NextResponse.json({ sessions: payload });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json()) as { session?: unknown };
  const session = normalizeSession(body.session);
  if (!session || !UUID_RE.test(session.id)) {
    return NextResponse.json({ error: "invalid_session" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error: sessionError } = await supabase.from("portfolio_ask_sessions").upsert(
    {
      id: session.id,
      user_id: user.id,
      title: session.title.slice(0, 120) || "Ask",
      scope: session.scope,
      created_at: session.createdAt || now,
      updated_at: now,
    },
    { onConflict: "id" },
  );
  if (sessionError) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  await supabase.from("portfolio_ask_turns").delete().eq("session_id", session.id).eq("user_id", user.id);

  if (session.turns.length > 0) {
    const rows = session.turns.slice(0, 80).map((turn, index) => ({
      id: UUID_RE.test(turn.id) ? turn.id : crypto.randomUUID(),
      session_id: session.id,
      user_id: user.id,
      role: turn.role,
      content: turn.text.slice(0, 8000) || " ",
      matched_ids: turn.matchedIds ?? [],
      citations: turn.citations ?? [],
      suggest_compare: Boolean(turn.suggestCompare),
      feedback: turn.feedback ?? null,
      feedback_reason: turn.feedbackReason ?? null,
      sort_index: index,
      created_at: turn.createdAt || now,
    }));
    // Keep client turn ids stable when they are UUIDs; otherwise remap in response via sort order.
    const { error: turnError } = await supabase.from("portfolio_ask_turns").insert(rows);
    if (turnError) {
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    }
  }

  return NextResponse.json({
    session: {
      ...session,
      updatedAt: now,
      cloudSyncedAt: now,
    },
  });
}
