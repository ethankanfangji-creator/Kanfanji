import {
  DraftDb,
  accountScopeForUser,
  getGuestAccountScope,
  userAccountScope,
} from "@/lib/draft-db";
import { createSyncEngine, type SyncEngine } from "./engine";
import { createSupabaseViewingSyncAdapter } from "./supabase-adapter";

let engineSingleton: SyncEngine | null = null;
let engineDb: DraftDb | null = null;
let engineScope: string | null = null;

/** Browser singleton SyncEngine backed by DraftDb + Supabase adapter. */
export async function getSyncEngine(options?: {
  isPro?: boolean;
  userId?: string | null;
}): Promise<SyncEngine> {
  const scope = accountScopeForUser(options?.userId ?? null);
  if (engineSingleton && engineScope === scope) {
    if (options?.isPro !== undefined) engineSingleton.setIsPro(options.isPro);
    return engineSingleton;
  }
  resetSyncEngineSingleton();
  engineDb = await DraftDb.open({ accountScope: scope });
  engineScope = scope;
  engineSingleton = createSyncEngine({
    db: engineDb,
    adapter: createSupabaseViewingSyncAdapter(),
    isPro: options?.isPro ?? false,
  });
  return engineSingleton;
}

/** User-confirmed login orchestration: transfer only this installation's guest data. */
export async function claimGuestDrafts(userId: string): Promise<number> {
  resetSyncEngineSingleton();
  const db = await DraftDb.open();
  try {
    return await db.claimGuestScope(getGuestAccountScope(), userAccountScope(userId), userId);
  } finally {
    db.close();
  }
}

/** Test / logout helper. */
export function resetSyncEngineSingleton(): void {
  try {
    engineDb?.close();
  } catch {
    // ignore
  }
  engineDb = null;
  engineSingleton = null;
  engineScope = null;
}
