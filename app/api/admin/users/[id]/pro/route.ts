import { NextResponse } from "next/server";
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
  const body = await readJson(request);
  const reason = reasonFrom(body);
  if (!reason || !body) return badRequest("reason");
  const grant = body.grant === true;
  const until = typeof body.until === "string" ? body.until : null;
  if (grant && (!until || Number.isNaN(Date.parse(until)))) return badRequest("until");

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_manual_pro", {
    p_actor_id: gate.user.id,
    p_target_user_id: id,
    p_grant: grant,
    p_until: grant ? until : null,
    p_reason: reason,
  });
  if (error) return NextResponse.json({ error: "PRO_UPDATE_FAILED" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
