import { DraftDb } from "@/lib/draft-db";
import { createSyncEngine, type SyncEngine } from "./engine";
import { createSupabaseViewingSyncAdapter } from "./supabase-adapter";

let engineSingleton: SyncEngine | null = null;
let engineDb: DraftDb | null = null;

/** Browser singleton SyncEngine backed by DraftDb + Supabase adapter. */
export async function getSyncEngine(options?: { isPro?: boolean }): Promise<SyncEngine> {
  if (engineSingleton) {
    if (options?.isPro !== undefined) engineSingleton.setIsPro(options.isPro);
    return engineSingleton;
  }
  engineDb = await DraftDb.open();
  engineSingleton = createSyncEngine({
    db: engineDb,
    adapter: createSupabaseViewingSyncAdapter(),
    isPro: options?.isPro ?? false,
  });
  return engineSingleton;
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
}
