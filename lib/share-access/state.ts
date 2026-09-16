/** Persisted under viewing.property.shareAccess (and optionally share_links rows). */

export type ShareAccessState = {
  version: 1;
  /** Stable id for owner APIs (not the URL token). */
  linkId: string;
  status: "active" | "revoked";
  expiresAt: string | null;
  /** scrypt$salt$hash — never returned to browsers. */
  passwordHash: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  lastResolvedAt: string | null;
};

export function isShareAccessState(value: unknown): value is ShareAccessState {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.version === 1 &&
    typeof obj.linkId === "string" &&
    (obj.status === "active" || obj.status === "revoked")
  );
}

export function newShareAccessState(partial?: Partial<ShareAccessState>): ShareAccessState {
  const now = new Date().toISOString();
  return {
    version: 1,
    linkId:
      partial?.linkId ||
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `link_${Date.now()}`),
    status: partial?.status ?? "active",
    expiresAt: partial?.expiresAt ?? null,
    passwordHash: partial?.passwordHash ?? null,
    createdAt: partial?.createdAt ?? now,
    updatedAt: partial?.updatedAt ?? now,
    revokedAt: partial?.revokedAt ?? null,
    lastResolvedAt: partial?.lastResolvedAt ?? null,
  };
}
