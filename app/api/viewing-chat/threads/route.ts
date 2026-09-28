import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createViewingRow } from "@/lib/viewings/create-gate.server";

export const runtime = "nodejs";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return noStore({ code: "UNAUTHENTICATED" }, 401);
  const body = (await request.json()) as Record<string, unknown>;
  const threadId = typeof body.threadId === "string" ? body.threadId : "";
  const address = typeof body.address === "string" ? body.address.trim() : "";
  if (!UUID_V4.test(threadId) || address.length < 1 || address.length > 500) {
    return noStore({ code: "invalid" }, 400);
  }
  const encoded = JSON.stringify(body);
  if (encoded.length > 2_000_000) return noStore({ code: "too_large" }, 413);
  const admin = createAdminClient();
  const result = await createViewingRow(admin, user.id, {
    id: threadId,
    address,
    idempotencyKey: `chat:${threadId}`,
    clientUpdatedAt: typeof body.clientUpdatedAt === "string" ? body.clientUpdatedAt : undefined,
    messages: Array.isArray(body.messages) ? body.messages : [],
    report: body.report ?? null,
    metadata: body.metadata ?? null,
    chatState: body.chatState ?? null,
  });
  if (result.outcome === "limit_reached") {
    return noStore(
      { code: "FREE_LIMIT_REACHED", limit: result.limit, freeCount: result.freeCount },
      402,
    );
  }
  return noStore(result, result.outcome === "created" ? 201 : 200);
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return noStore({ code: "UNAUTHENTICATED" }, 401);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("viewings")
    .select("id, address, updated_at, created_at, chat_state, report")
    .eq("user_id", user.id)
    .not("chat_state", "is", null);
  if (error) return noStore({ code: "unavailable" }, 503);
  return noStore({
    threads: (data ?? []).map((row) => ({
      id: row.id,
      address: row.address,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
      pinned: Boolean((row.chat_state as { pinned?: boolean } | null)?.pinned),
      hasReport: row.report != null,
    })),
  });
}
