export function filterHistoryThreads<
  T extends { address: string; normalizedAddress?: string | null },
>(threads: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return threads;
  return threads.filter((thread) =>
    `${thread.address} ${thread.normalizedAddress ?? ""}`.toLowerCase().includes(needle),
  );
}
