/**
 * Local viewing session id helpers (extracted from ClientPage).
 * Mint only when creating a new viewing or confirming address — never on step leave alone.
 */

export async function resolveExistingLocalSessionId(input: {
  draftSessionId: string | null;
  getActiveDraft: () => Promise<{ localSessionId?: string | null } | null>;
}): Promise<string | null> {
  if (input.draftSessionId) return input.draftSessionId;
  const draft = await input.getActiveDraft();
  return draft?.localSessionId ?? null;
}

export async function createStableLocalSessionId(input: {
  createEntityId: () => string;
  setDraftSessionId: (id: string) => void;
}): Promise<string> {
  const id = input.createEntityId();
  input.setDraftSessionId(id);
  return id;
}

export async function ensureLocalSessionId(input: {
  draftSessionId: string | null;
  getActiveDraft: () => Promise<{ localSessionId?: string | null } | null>;
  createEntityId: () => string;
  setDraftSessionId: (id: string) => void;
}): Promise<string> {
  const existing = await resolveExistingLocalSessionId(input);
  if (existing) return existing;
  return createStableLocalSessionId(input);
}
