/**
 * Map AI boundary HTTP `code` / `status` to localized copy + actionable CTAs.
 * Does not change quota limits or models — presentation only.
 */

export type AiUiAction = "retry" | "sign_in" | "upgrade";

export type AiErrorUiKind =
  | "quota"
  | "auth"
  | "consent"
  | "unavailable"
  | "timeout"
  | "upstream"
  | "validation"
  | "unknown";

export type AiErrorUiCopy = {
  quotaGuest: string;
  quotaUser: string;
  quotaPro: string;
  quotaNetwork: string;
  authRequired: string;
  consentRequired: string;
  unavailable: string;
  /** Guest session could not be signed (ai_identity_unavailable). */
  identityUnavailable: string;
  failed: string;
  timeout: string;
  validation: string;
};

export type AiErrorUiModel = {
  kind: AiErrorUiKind;
  message: string;
  actions: AiUiAction[];
};

export type AiErrorResponseLike = {
  code?: string | null;
  status?: number | null;
  error?: string | null;
  tier?: "guest" | "free" | "pro" | null;
  limit?: "tier" | "network" | null;
  resetsAt?: string | null;
};

const OPAQUE_SERVER_ERROR = "AI request could not be completed.";

function normalizeCode(code: string | null | undefined): string {
  return (code ?? "").trim().toLowerCase();
}

/**
 * Prefer structured `code` + HTTP status over the opaque English server `error` string.
 */
export function mapAiErrorToUi(
  input: AiErrorResponseLike,
  copy: AiErrorUiCopy,
  opts?: { isAuthenticated?: boolean; locale?: string },
): AiErrorUiModel {
  const code = normalizeCode(input.code);
  const status =
    typeof input.status === "number" && Number.isFinite(input.status)
      ? input.status
      : 0;
  const isAuthenticated = Boolean(opts?.isAuthenticated);

  if (code === "ai_quota_exceeded" || status === 429) {
    if (input.limit === "network") {
      return { kind: "quota", message: copy.quotaNetwork, actions: ["retry"] };
    }
    if (input.tier === "guest") {
      return { kind: "quota", message: copy.quotaGuest, actions: ["sign_in"] };
    }
    if (input.tier === "free") {
      return { kind: "quota", message: copy.quotaUser, actions: ["upgrade"] };
    }
    if (input.tier === "pro") {
      const when = input.resetsAt
        ? new Intl.DateTimeFormat(opts?.locale || "zh-TW", {
            timeZone: "Etc/GMT+7",
            month: "numeric",
            day: "numeric",
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(input.resetsAt))
        : "";
      return { kind: "quota", message: copy.quotaPro.replace("{resetAt}", when), actions: [] };
    }
    return {
      kind: "quota",
      message: isAuthenticated ? copy.quotaUser : copy.quotaGuest,
      actions: isAuthenticated ? ["upgrade", "retry"] : ["sign_in", "upgrade"],
    };
  }

  if (
    code === "ai_auth_required" ||
    code === "ai_identity_mismatch" ||
    status === 401
  ) {
    return {
      kind: "auth",
      message: copy.authRequired,
      actions: ["sign_in"],
    };
  }

  if (code === "ai_consent_required" || (status === 403 && code.includes("consent"))) {
    return {
      kind: "consent",
      message: copy.consentRequired,
      actions: ["retry"],
    };
  }

  if (code === "ai_identity_unavailable") {
    return {
      kind: "unavailable",
      message: copy.identityUnavailable,
      actions: ["retry"],
    };
  }

  if (
    code === "ai_quota_unavailable" ||
    code === "ai_unavailable"
  ) {
    return {
      kind: "unavailable",
      message: copy.unavailable,
      actions: ["retry"],
    };
  }

  if (code === "ai_upstream_timeout" || status === 504) {
    return {
      kind: "timeout",
      message: copy.timeout,
      actions: ["retry"],
    };
  }

  if (
    code === "ai_upstream_failed" ||
    code === "ai_upstream_error" ||
    status >= 500
  ) {
    return {
      kind: "upstream",
      message: copy.failed,
      actions: ["retry"],
    };
  }

  if (status >= 400 && status < 500) {
    return {
      kind: "validation",
      message: copy.validation,
      actions: ["retry"],
    };
  }

  const raw = typeof input.error === "string" ? input.error.trim() : "";
  if (raw && raw !== OPAQUE_SERVER_ERROR && !/^ai_[a-z0-9_]+$/i.test(raw)) {
    return {
      kind: "unknown",
      message: raw,
      actions: ["retry"],
    };
  }

  return {
    kind: "unknown",
    message: copy.failed,
    actions: ["retry"],
  };
}

/** Build mapper copy from app `messages.aiBoundary` (+ shared CTA strings). */
export function aiErrorUiCopyFromBoundary(
  boundary: {
    quotaGuest: string;
    quotaUser: string;
    quotaPro: string;
    quotaNetwork: string;
    authRequired: string;
    consentRequired: string;
    unavailable: string;
    identityUnavailable: string;
    failed: string;
    timeout: string;
    validation: string;
  },
): AiErrorUiCopy {
  return {
    quotaGuest: boundary.quotaGuest,
    quotaUser: boundary.quotaUser,
    quotaPro: boundary.quotaPro,
    quotaNetwork: boundary.quotaNetwork,
    authRequired: boundary.authRequired,
    consentRequired: boundary.consentRequired,
    unavailable: boundary.unavailable,
    identityUnavailable: boundary.identityUnavailable,
    failed: boundary.failed,
    timeout: boundary.timeout,
    validation: boundary.validation,
  };
}
