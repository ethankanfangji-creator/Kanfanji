import { chatShareExpiresAt } from "./share-rate-limit.server";

export function assertChatShareExpiry(
  viewing: { chat_state?: unknown },
  patch: { expiresAt?: string | null },
  now = new Date(),
) {
  if (!viewing.chat_state) return;
  if (!Object.hasOwn(patch, "expiresAt")) return;
  // Null means never expires (owner stops sharing manually).
  if (patch.expiresAt == null) return;
  const requested = Date.parse(patch.expiresAt);
  const cap = Date.parse(chatShareExpiresAt(now));
  if (!Number.isFinite(requested) || requested > cap) throw new Error("SHARE_EXPIRES_INVALID");
}
