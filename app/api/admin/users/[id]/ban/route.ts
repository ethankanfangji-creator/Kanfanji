import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/admin/audit";
import { badRequest, readAdmin, readJson, reasonFrom } from "@/lib/admin/http";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await readAdmin();
  if (gate.error) return gate.error;
  const { id } = await context.params;
  if (id === gate.user.id) return badRequest("self");
  const body = await readJson(request);
  const reason = reasonFrom(body);
  if (!reason || !body || typeof body.ban !== "boolean") return badRequest("reason");

  const admin = createAdminClient();
  const { data: target, error: targetError } = await admin.auth.admin.getUserById(id);
  if (targetError || !target.user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (target.user.app_metadata?.role === "admin" && body.confirm !== true) {
    return badRequest("confirm");
  }

  const action = body.ban ? "user_ban" : "user_unban";
  const before = { banned_until: target.user.banned_until ?? null };
  try {
    await writeAudit({
      actorId: gate.user.id,
      targetUserId: id,
      action,
      reason,
      outcome: "requested",
      before,
    });
    const { error } = await admin.auth.admin.updateUserById(id, {
      ban_duration: body.ban ? "876000h" : "none",
    });
    if (error) throw error;
    await writeAudit({
      actorId: gate.user.id,
      targetUserId: id,
      action,
      reason,
      outcome: "succeeded",
      before,
      after: { banned_until: body.ban ? "banned" : null },
    });
    return NextResponse.json({ ok: true });
  } catch {
    await writeAudit({
      actorId: gate.user.id,
      targetUserId: id,
      action,
      reason,
      outcome: "failed",
      before,
    }).catch(() => undefined);
    return NextResponse.json({ error: "BAN_FAILED" }, { status: 500 });
  }
}
