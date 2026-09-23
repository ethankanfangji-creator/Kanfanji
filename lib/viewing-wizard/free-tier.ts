/**
 * Free-tier / guest viewing creation policy (extracted from ClientPage).
 */

export const FREE_VIEWING_LIMIT = 3;

/** Guests may keep one local viewing on-device; a second room requires login. */
export const GUEST_LOCAL_VIEWING_LIMIT = 1;

export type ViewingCreateGateInput = {
  /** Existing cloud viewing id — edits to current viewing are allowed. */
  viewingId: string | null;
  /** Count of cloud viewings for this user. */
  freeCount: number;
  isPro: boolean;
  authenticated: boolean;
};

export type ViewingCreateGateResult =
  | { allowed: true }
  | { allowed: false; reason: "paywall" | "login_required" };

/**
 * Whether the user may create / generate a *new* cloud viewing.
 * Guests are not blocked here for local drafts — call sites still require login for share/generate.
 */
export function canCreateCloudViewing(input: ViewingCreateGateInput): ViewingCreateGateResult {
  if (input.viewingId) return { allowed: true };
  if (!input.authenticated) return { allowed: false, reason: "login_required" };
  if (!input.isPro && input.freeCount >= FREE_VIEWING_LIMIT) {
    return { allowed: false, reason: "paywall" };
  }
  return { allowed: true };
}

/**
 * Guest on-device room limit. Authenticated users are not gated here
 * (cloud free-tier uses canCreateCloudViewing). Continuing the *same*
 * local session does not increment localViewingCount.
 */
export function canStartLocalViewing(input: {
  authenticated: boolean;
  /** Distinct local viewing sessions already stored for this guest installation. */
  localViewingCount: number;
}): ViewingCreateGateResult {
  if (input.authenticated) return { allowed: true };
  if (input.localViewingCount >= GUEST_LOCAL_VIEWING_LIMIT) {
    return { allowed: false, reason: "login_required" };
  }
  return { allowed: true };
}
