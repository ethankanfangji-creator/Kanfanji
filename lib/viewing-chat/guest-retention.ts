import type { ViewingChatThread } from "./types";

function clampDays(value: number): number {
  if (!Number.isFinite(value)) return 3;
  return Math.max(1, Math.min(30, Math.floor(value)));
}

export function guestLocalTtlDays(): number {
  return clampDays(Number(process.env.NEXT_PUBLIC_GUEST_LOCAL_TTL_DAYS ?? 3));
}

export function guestExpiresAt(
  thread: Pick<ViewingChatThread, "updatedAt">,
  ttlDays = guestLocalTtlDays(),
): Date {
  return new Date(new Date(thread.updatedAt).getTime() + ttlDays * 24 * 60 * 60 * 1000);
}

export function guestDaysLeft(
  thread: Pick<ViewingChatThread, "updatedAt">,
  now = new Date(),
  ttlDays = guestLocalTtlDays(),
): number {
  const ms = guestExpiresAt(thread, ttlDays).getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export function isExpiredGuestThread(
  thread: Pick<ViewingChatThread, "updatedAt" | "ownerUserId">,
  now = new Date(),
  ttlDays = guestLocalTtlDays(),
): boolean {
  if (thread.ownerUserId) return false;
  return guestExpiresAt(thread, ttlDays).getTime() <= now.getTime();
}
