import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const MAX_SHARE_PASSWORD_LENGTH = 256;

export type ShareUnlockRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export interface ShareUnlockRateLimiter {
  consume(key: string): Promise<ShareUnlockRateLimitResult>;
}

export function shareUnlockRateLimitKey(tokenFingerprint: string, clientId: string): string {
  return createHash("sha256")
    .update(`${tokenFingerprint}:${clientId}`)
    .digest("hex");
}

/** Atomic persistence is implemented by consume_share_unlock_attempt in Postgres. */
export class SupabaseShareUnlockRateLimiter implements ShareUnlockRateLimiter {
  constructor(private readonly admin: SupabaseClient) {}

  async consume(key: string): Promise<ShareUnlockRateLimitResult> {
    const { data, error } = await this.admin.rpc("consume_share_unlock_attempt", {
      p_key: key,
    });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as
      | { allowed: boolean; retry_after_seconds: number }
      | null;
    return {
      allowed: Boolean(row?.allowed),
      retryAfterSeconds: Math.max(0, Number(row?.retry_after_seconds ?? 0)),
    };
  }
}
