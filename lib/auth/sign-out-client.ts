import { listLocalThreads, deleteLocalThread } from "@/lib/viewing-chat/local-store";
import { removeMediaByThread } from "@/lib/viewing-chat/media-library";
import { resetSyncEngineSingleton } from "@/lib/sync";
import { setPersistenceAccountScope } from "@/lib/idb/draft-store";
import { getSupabase } from "@/lib/supabase";

export async function signOutAndClearLocal(): Promise<boolean> {
  const unsynced = listLocalThreads().filter((thread) =>
    thread.ownerUserId && thread.cloud && ["failed", "syncing", "blocked_limit"].includes(thread.cloud.state),
  );
  if (unsynced.length > 0) {
    const ok = window.confirm(
      `有 ${unsynced.length} 筆紀錄還沒存到雲端，登出後會從這台裝置刪除。確定登出？`,
    );
    if (!ok) return false;
  }
  const owned = listLocalThreads().filter((thread) => thread.ownerUserId);
  await getSupabase()?.auth.signOut();
  await Promise.all(owned.map((thread) => removeMediaByThread(thread.id)));
  for (const thread of owned) deleteLocalThread(thread.id);
  resetSyncEngineSingleton();
  await setPersistenceAccountScope(null);
  return true;
}
