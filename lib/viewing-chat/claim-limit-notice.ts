import { listLocalThreads } from "./local-store";

export const CLAIM_LIMIT_NOTICE_KEY = "kf.claim.notice";

/** True when this account has at least one local thread blocked by free-tier sync limit. */
export function hasBlockedLimitThreads(userId: string): boolean {
  return listLocalThreads().some(
    (thread) => thread.ownerUserId === userId && thread.cloud?.state === "blocked_limit",
  );
}

/**
 * Once per browser session: whether to show the soft claim-limit reminder.
 * Call after claim / pull so blocked_limit state is already on disk.
 */
export function consumeClaimLimitNotice(shouldShow: boolean): boolean {
  if (typeof window === "undefined" || !shouldShow) return false;
  if (window.sessionStorage.getItem(CLAIM_LIMIT_NOTICE_KEY)) return false;
  window.sessionStorage.setItem(CLAIM_LIMIT_NOTICE_KEY, "1");
  return true;
}
