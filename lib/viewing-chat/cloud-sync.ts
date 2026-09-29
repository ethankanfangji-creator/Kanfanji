export type SyncState = "local_only" | "syncing" | "synced" | "failed" | "blocked_limit";

const RETRY_DELAYS_MS = [2_000, 8_000, 30_000];

export async function syncWithRetry(input: {
  put: () => Promise<{ status: number }>;
  sleep?: (ms: number) => Promise<void>;
}): Promise<SyncState> {
  const sleep = input.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await input.put();
    if (result.status === 402) return "blocked_limit";
    if (result.status >= 200 && result.status < 300) return "synced";
    if (attempt < 2) await sleep(RETRY_DELAYS_MS[attempt] ?? 30_000);
  }
  return "failed";
}
