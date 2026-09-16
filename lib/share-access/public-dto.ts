import {
  isDecisionSummarySnapshot,
  toPublicDecisionSummary,
  type DecisionSummarySnapshot,
} from "@/lib/share-card";
import type { Viewing } from "@/lib/types";
import type {
  PublicShareFailure,
  PublicSharePayload,
  PublicShareResult,
  ShareLinkStatus,
} from "./types";
import { PUBLIC_SHARE_FORBIDDEN_KEYS } from "./types";

function stripForbiddenKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripForbiddenKeys);
  }
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if ((PUBLIC_SHARE_FORBIDDEN_KEYS as readonly string[]).includes(key)) {
      continue;
    }
    out[key] = stripForbiddenKeys(nested);
  }
  return out;
}

export function assertNoForbiddenPublicKeys(payload: unknown): string[] {
  const found: string[] = [];
  const walk = (node: unknown, path: string) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [key, nested] of Object.entries(node as Record<string, unknown>)) {
      const next = path ? `${path}.${key}` : key;
      if ((PUBLIC_SHARE_FORBIDDEN_KEYS as readonly string[]).includes(key)) {
        found.push(next);
      }
      walk(nested, next);
    }
  };
  walk(payload, "");
  return found;
}

export function publicShareFailure(
  status: PublicShareFailure["status"],
  message: string,
): PublicShareFailure {
  return { version: 1, status, message };
}

export function resolveShareLinkGate(input: {
  found: boolean;
  revokedAt?: string | null;
  expiresAt?: string | null;
  passwordHash?: string | null;
  unlocked?: boolean;
  now?: Date;
}): ShareLinkStatus {
  if (!input.found) return "missing";
  if (input.revokedAt) return "revoked";
  const now = input.now ?? new Date();
  if (input.expiresAt) {
    const exp = new Date(input.expiresAt);
    if (!Number.isNaN(exp.getTime()) && exp.getTime() <= now.getTime()) {
      return "expired";
    }
  }
  if (input.passwordHash && !input.unlocked) return "password_required";
  return "active";
}

/**
 * Project a viewing row into the least-privilege public payload.
 * Drops audio, transcripts, questions, account fields, and internal drafts.
 * Does NOT implement expiry/password — callers must gate first.
 */
export function toPublicSharePayload(input: {
  viewing: Viewing;
  decisionSummary?: DecisionSummarySnapshot | null;
  photoUrls?: string[];
  expiresAt?: string | null;
  passwordProtected?: boolean;
  snapshotUpdatedAt?: string | null;
}): PublicSharePayload {
  const raw =
    input.decisionSummary ??
    (isDecisionSummarySnapshot(input.viewing.property?.decisionSummary)
      ? toPublicDecisionSummary(input.viewing.property.decisionSummary)
      : null);

  const summary = raw
    ? (stripForbiddenKeys(toPublicDecisionSummary(raw)) as DecisionSummarySnapshot)
    : null;

  const photoUrls =
    input.photoUrls ??
    summary?.photos.map((p) => p.url).filter(Boolean) ??
    [];

  const legacyHighlights = summary
    ? undefined
    : {
        pros: (input.viewing.pros ?? []).filter((t) => t.trim()).slice(0, 3),
        risks: (input.viewing.risks ?? []).filter((t) => t.trim()).slice(0, 3),
      };

  const payload: PublicSharePayload = {
    version: 1,
    capability: "read",
    status: "active",
    title: "看房決策摘要",
    address: (summary?.address || input.viewing.address || "").trim(),
    updatedAt: input.viewing.updated_at ?? null,
    decisionSummary: summary,
    photoUrls,
    legacyHighlights,
    meta: {
      passwordProtected: Boolean(input.passwordProtected),
      expiresAt: input.expiresAt ?? null,
      snapshotUpdatedAt:
        input.snapshotUpdatedAt ??
        summary?.generatedAt ??
        input.viewing.updated_at ??
        null,
    },
  };

  return stripForbiddenKeys(payload) as PublicSharePayload;
}

export function mapStatusToFailure(status: ShareLinkStatus): PublicShareResult {
  switch (status) {
    case "missing":
      return publicShareFailure("missing", "此分享連結不存在或已被移除。");
    case "revoked":
      return publicShareFailure("revoked", "此分享連結已取消，無法再開啟。");
    case "expired":
      return publicShareFailure("expired", "此分享連結已過期。");
    case "forbidden":
      return publicShareFailure("forbidden", "沒有權限檢視此分享內容。");
    case "password_required":
      return {
        version: 1,
        status: "password_required",
        challengeId: "pending",
        message: "此分享受密碼保護。後端解鎖尚未啟用。",
      };
    case "error":
    default:
      return publicShareFailure("error", "載入分享內容時發生錯誤。");
  }
}
