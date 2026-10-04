import type { PortfolioSession } from "./session-store";
import { mergeCloudSessions, normalizeSession, upsertPortfolioSession } from "./session-store";

export async function pullPortfolioSessionsFromCloud(
  fetchImpl: typeof fetch = fetch,
): Promise<PortfolioSession[]> {
  const response = await fetchImpl("/api/portfolio/sessions", { method: "GET" });
  if (!response.ok) return [];
  const data = (await response.json()) as { sessions?: unknown[] };
  const sessions = (data.sessions ?? [])
    .map((row) => normalizeSession(row))
    .filter((row): row is PortfolioSession => Boolean(row));
  mergeCloudSessions(sessions);
  return sessions;
}

export async function pushPortfolioSessionToCloud(
  session: PortfolioSession,
  fetchImpl: typeof fetch = fetch,
): Promise<PortfolioSession | null> {
  const response = await fetchImpl("/api/portfolio/sessions", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session }),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { session?: unknown };
  const normalized = normalizeSession(data.session ?? session);
  if (!normalized) return null;
  return upsertPortfolioSession({
    ...normalized,
    cloudSyncedAt: new Date().toISOString(),
  });
}

export async function deletePortfolioSessionOnCloud(
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const response = await fetchImpl(`/api/portfolio/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return response.ok || response.status === 404;
}
