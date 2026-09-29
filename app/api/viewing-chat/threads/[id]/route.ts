import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  assertAllowedKeys,
  readJsonObject,
  RequestValidationError,
} from "@/lib/http/validation";
import { appendChatMessages } from "@/lib/viewing-chat/append-messages";
import {
  assertChatBodySize,
  parseChatMessages,
  parseChatState,
  parseClientUpdatedAt,
} from "@/lib/viewing-chat/thread-payload";
import type { ChatMessage } from "@/lib/viewing-chat/types";

export const runtime = "nodejs";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return noStore({ code: "UNAUTHENTICATED" }, 401);
  try {
    const raw = await request.text();
    assertChatBodySize(raw);
    const body = await readJsonObject(new Request(request.url, { method: "PUT", body: raw }));
    assertAllowedKeys(body, ["clientUpdatedAt", "baseRevision", "messages", "chatState"]);
    const clientUpdatedAt = parseClientUpdatedAt(body.clientUpdatedAt);
    const messages = body.messages === undefined ? undefined : parseChatMessages(body.messages);
    const chatState = body.chatState === undefined ? undefined : parseChatState(body.chatState);
    const baseRevision = body.baseRevision;
    if (baseRevision !== undefined && (!Number.isInteger(baseRevision) || Number(baseRevision) < 1)) {
      throw new RequestValidationError("INVALID_FIELD_TYPE", "baseRevision");
    }
    const admin = createAdminClient();
    const current = await admin
      .from("viewings")
      .select("id, user_id, messages, revision")
      .eq("id", id)
      .maybeSingle();
    if (current.error || !current.data || current.data.user_id !== user.id) {
      return noStore({ code: "not_found" }, 404);
    }
    const revision = Number(current.data.revision ?? 1);
    if (typeof baseRevision === "number" && baseRevision !== revision) {
      return noStore({ code: "stale", serverRevision: revision }, 409);
    }
    const existing = Array.isArray(current.data.messages)
      ? (current.data.messages as ChatMessage[])
      : [];
    const merged = messages ? appendChatMessages(existing, messages) : undefined;
    const { error } = await admin
      .from("viewings")
      .update({
        ...(merged ? { messages: merged } : {}),
        ...(chatState ? { chat_state: chatState } : {}),
        ...(clientUpdatedAt ? { client_updated_at: clientUpdatedAt } : {}),
        revision: revision + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return noStore({ code: "unavailable" }, 503);
    return noStore({ ok: true, revision: revision + 1 });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      const status = error.code === "BODY_TOO_LARGE" ? 413 : 400;
      return noStore({ code: error.code, field: error.field }, status);
    }
    return noStore({ code: "unavailable" }, 503);
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return noStore({ code: "UNAUTHENTICATED" }, 401);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("viewings")
    .select("id, user_id, address, messages, report, metadata, chat_state, revision, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !data || data.user_id !== user.id) return noStore({ code: "not_found" }, 404);
  return noStore(data);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return noStore({ code: "UNAUTHENTICATED" }, 401);
  const admin = createAdminClient();
  const { error } = await admin.from("viewings").delete().eq("id", id).eq("user_id", user.id);
  if (error) return noStore({ code: "unavailable" }, 503);
  return noStore({ ok: true });
}
