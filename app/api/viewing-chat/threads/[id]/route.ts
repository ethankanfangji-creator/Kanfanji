import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  assertAllowedKeys,
  readJsonObject,
  RequestValidationError,
} from "@/lib/http/validation";
import { resolveThreadMessages } from "@/lib/viewing-chat/merge-messages";
import { getViewingRole } from "@/lib/collaboration/server";
import {
  assertChatBodySize,
  parseChatMessages,
  parseChatState,
  parseClientUpdatedAt,
} from "@/lib/viewing-chat/thread-payload";
import { mergeChatState } from "@/lib/viewing-chat/chat-state";
import type { ChatMessage } from "@/lib/viewing-chat/types";
import { schedulePropertySignalsRefresh } from "@/lib/properties/signals";
import { coerceDecisionStatus } from "@/lib/portfolio/decision-status";

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
    assertAllowedKeys(body, ["clientUpdatedAt", "baseRevision", "messages", "chatState", "report"]);
    const clientUpdatedAt = parseClientUpdatedAt(body.clientUpdatedAt);
    const messages = body.messages === undefined ? undefined : parseChatMessages(body.messages);
    const chatState = body.chatState === undefined ? undefined : parseChatState(body.chatState);
    const report =
      body.report === undefined
        ? undefined
        : body.report === null || (typeof body.report === "object" && !Array.isArray(body.report))
          ? body.report
          : (() => {
              throw new RequestValidationError("INVALID_FIELD_TYPE", "report");
            })();
    const baseRevision = body.baseRevision;
    if (baseRevision !== undefined && (!Number.isInteger(baseRevision) || Number(baseRevision) < 1)) {
      throw new RequestValidationError("INVALID_FIELD_TYPE", "baseRevision");
    }
    const admin = createAdminClient();
    const current = await admin
      .from("viewings")
      .select("id, user_id, messages, revision, chat_state, property_id")
      .eq("id", id)
      .maybeSingle();
    if (current.error || !current.data) {
      return noStore({ code: "not_found" }, 404);
    }
    const isOwner = current.data.user_id === user.id;
    if (!isOwner) {
      const member = await admin
        .from("viewing_members")
        .select("role, status")
        .eq("viewing_id", id)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      if (member.data?.role !== "editor" && member.data?.role !== "commenter") {
        return noStore({ code: "not_found" }, 404);
      }
    }
    const revision = Number(current.data.revision ?? 1);
    if (baseRevision === undefined) {
      return noStore({ code: "base_revision_required" }, 400);
    }
    if (typeof baseRevision === "number" && baseRevision !== revision) {
      return noStore({ code: "stale", serverRevision: revision }, 409);
    }
    const existing = Array.isArray(current.data.messages)
      ? (current.data.messages as ChatMessage[])
      : [];
    const merged = messages
      ? resolveThreadMessages({ isOwner, existing, incoming: messages })
      : undefined;
    const nextChatState =
      isOwner && chatState
        ? mergeChatState(current.data.chat_state, chatState)
        : null;
    const { error } = await admin
      .from("viewings")
      .update({
        ...(merged ? { messages: merged } : {}),
        ...(nextChatState ? { chat_state: nextChatState } : {}),
        ...(isOwner && report !== undefined ? { report } : {}),
        ...(clientUpdatedAt ? { client_updated_at: clientUpdatedAt } : {}),
        revision: revision + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", current.data.user_id);
    if (error) return noStore({ code: "unavailable" }, 503);

    if (nextChatState) {
      const prevStatus = coerceDecisionStatus(
        (current.data.chat_state as { decisionStatus?: unknown } | null)?.decisionStatus,
      );
      const nextStatus = coerceDecisionStatus(
        (nextChatState as { decisionStatus?: unknown }).decisionStatus,
      );
      if (prevStatus !== nextStatus) {
        const propertyId =
          typeof (current.data as { property_id?: unknown }).property_id === "string"
            ? String((current.data as { property_id?: string }).property_id)
            : null;
        schedulePropertySignalsRefresh(admin, propertyId);
      }
    }

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
  if (error || !data) return noStore({ code: "not_found" }, 404);
  const role = data.user_id === user.id ? "owner" : await getViewingRole(id, user.id);
  if (!role) return noStore({ code: "not_found" }, 404);
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
  const owned = await admin
    .from("viewings")
    .select("id, property_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (owned.error || !owned.data) return noStore({ code: "not_found" }, 404);
  const propertyId =
    typeof owned.data.property_id === "string" ? owned.data.property_id : null;
  await removeViewingObjects(admin, user.id, id);
  const { error } = await admin.from("viewings").delete().eq("id", id).eq("user_id", user.id);
  if (error) return noStore({ code: "unavailable" }, 503);
  schedulePropertySignalsRefresh(admin, propertyId);
  return noStore({ ok: true });
}

async function removeViewingObjects(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  viewingId: string,
) {
  const bucket = admin.storage.from("viewing-media");
  for (const folder of ["photos", "videos", "audios", "files"]) {
    const prefix = `${userId}/${viewingId}/${folder}`;
    const names: string[] = [];
    for (let offset = 0; ; offset += 100) {
      const listed = await bucket.list(prefix, { limit: 100, offset });
      if (listed.error) {
        console.error("viewing_media_list_failed");
        break;
      }
      const batch = listed.data ?? [];
      names.push(...batch.map((item) => item.name).filter(Boolean));
      if (batch.length < 100) break;
    }
    if (names.length === 0) continue;
    const removed = await bucket.remove(names.map((name) => `${prefix}/${name}`));
    if (removed.error) console.error("viewing_media_delete_failed");
  }
}
