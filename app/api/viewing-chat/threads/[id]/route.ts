import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

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
  const body = (await request.json()) as { clientUpdatedAt?: string; messages?: unknown; chatState?: unknown };
  const admin = createAdminClient();
  const current = await admin
    .from("viewings")
    .select("id, user_id, client_updated_at")
    .eq("id", id)
    .maybeSingle();
  if (current.error || !current.data || current.data.user_id !== user.id) {
    return noStore({ code: "not_found" }, 404);
  }
  const serverUpdated = current.data.client_updated_at
    ? new Date(String(current.data.client_updated_at)).getTime()
    : 0;
  const clientUpdated = body.clientUpdatedAt ? new Date(body.clientUpdatedAt).getTime() : 0;
  if (serverUpdated > clientUpdated) {
    return noStore({ code: "stale", serverUpdatedAt: current.data.client_updated_at }, 409);
  }
  const { error } = await admin
    .from("viewings")
    .update({
      ...(body.messages !== undefined ? { messages: body.messages } : {}),
      ...(body.chatState !== undefined ? { chat_state: body.chatState } : {}),
      client_updated_at: body.clientUpdatedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return noStore({ code: "unavailable" }, 503);
  return noStore({ ok: true });
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
    .select("id, user_id, messages, report, metadata, chat_state")
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
