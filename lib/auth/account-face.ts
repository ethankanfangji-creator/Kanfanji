import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AccountFace = {
  label: string;
  avatarUrl: string | null;
};

/** Display name + optional avatar from Auth user metadata (OAuth / profile). */
export function accountFaceFromUser(
  user: User | null | undefined,
  fallbackLabel = "—",
): AccountFace {
  if (!user) return { label: fallbackLabel, avatarUrl: null };
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const picture = [meta.avatar_url, meta.picture].find(
    (value): value is string =>
      typeof value === "string" &&
      (value.startsWith("https://") || value.startsWith("http://")),
  );
  const named = [meta.full_name, meta.name].find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  const emailLocal =
    typeof user.email === "string" && user.email.includes("@")
      ? user.email.split("@")[0]!.trim()
      : "";
  const label = (named?.trim() || emailLocal || fallbackLabel).trim() || fallbackLabel;
  return { label, avatarUrl: picture ?? null };
}

/** Batch-resolve faces for user ids via the Auth Admin API. */
export async function resolveAccountFaces(
  admin: SupabaseClient,
  userIds: string[],
  fallbackLabel = "—",
): Promise<Map<string, AccountFace>> {
  const result = new Map<string, AccountFace>();
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return result;
  await Promise.all(
    unique.map(async (id) => {
      try {
        const { data } = await admin.auth.admin.getUserById(id);
        result.set(id, accountFaceFromUser(data.user, fallbackLabel));
      } catch {
        result.set(id, { label: fallbackLabel, avatarUrl: null });
      }
    }),
  );
  return result;
}
