import { createAdminClient } from "@/utils/supabase/admin";

export async function writeAudit(input: {
  actorId: string;
  targetUserId: string;
  action: "user_ban" | "user_unban";
  reason: string;
  outcome: "requested" | "succeeded" | "failed";
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("admin_audit_log").insert({
    actor_id: input.actorId,
    target_user_id: input.targetUserId,
    action: input.action,
    before: input.before ?? {},
    after: input.after ?? {},
    reason: input.reason,
    outcome: input.outcome,
  });
  if (error) throw new Error("AUDIT_WRITE_FAILED");
}
