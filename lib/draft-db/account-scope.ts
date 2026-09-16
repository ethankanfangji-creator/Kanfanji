const GUEST_INSTALLATION_KEY = "kanfangji.guest-installation-id";

export type AccountScope = `guest:${string}` | `user:${string}`;

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `install-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Stable per-browser guest identity; never changes merely because auth state changes. */
export function getGuestAccountScope(storage?: Pick<Storage, "getItem" | "setItem">): AccountScope {
  const target = storage ?? (typeof localStorage === "undefined" ? null : localStorage);
  if (!target) return "guest:server";
  let id = target.getItem(GUEST_INSTALLATION_KEY);
  if (!id) {
    id = randomId();
    target.setItem(GUEST_INSTALLATION_KEY, id);
  }
  return `guest:${id}`;
}

export function userAccountScope(userId: string): AccountScope {
  if (!userId) throw new Error("userId is required");
  return `user:${userId}`;
}

export function accountScopeForUser(userId: string | null): AccountScope {
  return userId ? userAccountScope(userId) : getGuestAccountScope();
}
