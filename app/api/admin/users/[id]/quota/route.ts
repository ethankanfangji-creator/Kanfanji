import { NextResponse } from "next/server";
import { fingerprint } from "@/lib/ai-boundary/quota";
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
  const reason = reasonFrom(await readJson(request));
  if (!reason) return badRequest("reason");

  let key: string;
  try {
    key = `user:${fingerprint(id)}`;
  } catch {
    return NextResponse.json({ error: "QUOTA_SECRET_MISSING" }, { status: 500 });
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_reset_ai_quota", {
    p_actor_id: gate.user.id,
    p_target_user_id: id,
    p_keys: [key],
    p_reason: reason,
  });
  if (error) return NextResponse.json({ error: "QUOTA_RESET_FAILED" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
