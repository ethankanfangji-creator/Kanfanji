import { defaultPortfolioScope } from "./scope";
import type { PortfolioChatTurn, PortfolioScope } from "./types";

const STORAGE_KEY = "kanfangji.portfolioSessions.v1";
const ACTIVE_KEY = "kanfangji.portfolioSessions.activeId";
export const PORTFOLIO_SESSION_LIMIT = 40;
export const PORTFOLIO_TURNS_LIMIT = 80;

export type PortfolioSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  scope: PortfolioScope;
  turns: PortfolioChatTurn[];
  /** Last successful cloud upsert ISO time, if any. */
  cloudSyncedAt?: string | null;
};

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `ps_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function readAll(): PortfolioSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => normalizeSession(row))
      .filter((row): row is PortfolioSession => Boolean(row))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, PORTFOLIO_SESSION_LIMIT);
  } catch {
    return [];
  }
}

function writeAll(sessions: PortfolioSession[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(sessions.slice(0, PORTFOLIO_SESSION_LIMIT)),
  );
}

function normalizeTurn(value: unknown): PortfolioChatTurn | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : "";
  const role = row.role === "user" || row.role === "assistant" ? row.role : null;
  const text = typeof row.text === "string" ? row.text : "";
  if (!id || !role) return null;
  return {
    id,
    role,
    text,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString(),
    matchedIds: Array.isArray(row.matchedIds)
      ? row.matchedIds.filter((x): x is string => typeof x === "string")
      : undefined,
    citations: Array.isArray(row.citations)
      ? row.citations
          .filter(
            (c): c is { viewingId: string; excerpt: string } =>
              Boolean(c) &&
              typeof c === "object" &&
              typeof (c as { viewingId?: unknown }).viewingId === "string" &&
              typeof (c as { excerpt?: unknown }).excerpt === "string",
          )
          .map((c) => ({ viewingId: c.viewingId, excerpt: c.excerpt }))
      : undefined,
    suggestCompare: Boolean(row.suggestCompare),
    feedback:
      row.feedback === "like" || row.feedback === "dislike" ? row.feedback : null,
    feedbackReason: typeof row.feedbackReason === "string" ? row.feedbackReason : null,
  };
}

function normalizeScope(value: unknown): PortfolioScope {
  if (!value || typeof value !== "object") return defaultPortfolioScope();
  const row = value as Record<string, unknown>;
  const mode =
    row.mode === "all" ||
    row.mode === "time" ||
    row.mode === "ids" ||
    row.mode === "status"
      ? row.mode
      : "all";
  return {
    mode,
    since: typeof row.since === "string" ? row.since : null,
    viewingIds: Array.isArray(row.viewingIds)
      ? row.viewingIds.filter((x): x is string => typeof x === "string")
      : undefined,
    statuses: Array.isArray(row.statuses)
      ? row.statuses.filter(
          (x): x is NonNullable<PortfolioScope["statuses"]>[number] =>
            x === "liked" || x === "shortlist" || x === "passed" || x === "revisit",
        )
      : undefined,
  };
}

export function normalizeSession(value: unknown): PortfolioSession | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) return null;
  const turns = Array.isArray(row.turns)
    ? row.turns.map(normalizeTurn).filter((t): t is PortfolioChatTurn => Boolean(t))
    : [];
  return {
    id,
    title: typeof row.title === "string" && row.title.trim() ? row.title.trim().slice(0, 120) : "Ask",
    createdAt: typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString(),
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : new Date().toISOString(),
    scope: normalizeScope(row.scope),
    turns: turns.slice(-PORTFOLIO_TURNS_LIMIT),
    cloudSyncedAt: typeof row.cloudSyncedAt === "string" ? row.cloudSyncedAt : null,
  };
}

export function listPortfolioSessions(): PortfolioSession[] {
  return readAll();
}

export function getPortfolioSession(id: string): PortfolioSession | null {
  return readAll().find((row) => row.id === id) ?? null;
}

export function getActivePortfolioSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_KEY);
}

export function setActivePortfolioSessionId(id: string | null) {
  if (typeof window === "undefined") return;
  if (!id) window.localStorage.removeItem(ACTIVE_KEY);
  else window.localStorage.setItem(ACTIVE_KEY, id);
}

export function titleFromTurns(turns: PortfolioChatTurn[]): string {
  const firstUser = turns.find((t) => t.role === "user" && t.text.trim());
  if (!firstUser) return "Ask";
  const text = firstUser.text.trim().replace(/\s+/g, " ");
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

export function createPortfolioSession(partial?: {
  scope?: PortfolioScope;
  turns?: PortfolioChatTurn[];
}): PortfolioSession {
  const now = new Date().toISOString();
  const turns = partial?.turns ?? [];
  const session: PortfolioSession = {
    id: newId(),
    title: titleFromTurns(turns),
    createdAt: now,
    updatedAt: now,
    scope: partial?.scope ?? defaultPortfolioScope(),
    turns,
    cloudSyncedAt: null,
  };
  writeAll([session, ...readAll().filter((row) => row.id !== session.id)]);
  setActivePortfolioSessionId(session.id);
  return session;
}

export function upsertPortfolioSession(session: PortfolioSession): PortfolioSession {
  const next: PortfolioSession = {
    ...session,
    title: session.title.trim() || titleFromTurns(session.turns),
    turns: session.turns.slice(-PORTFOLIO_TURNS_LIMIT),
    updatedAt: new Date().toISOString(),
  };
  const others = readAll().filter((row) => row.id !== next.id);
  writeAll([next, ...others]);
  return next;
}

export function deletePortfolioSession(id: string) {
  writeAll(readAll().filter((row) => row.id !== id));
  if (getActivePortfolioSessionId() === id) setActivePortfolioSessionId(null);
}

export function mergeCloudSessions(remote: PortfolioSession[]) {
  const byId = new Map<string, PortfolioSession>();
  for (const row of readAll()) byId.set(row.id, row);
  for (const row of remote) {
    const normalized = normalizeSession(row);
    if (!normalized) continue;
    const local = byId.get(normalized.id);
    if (!local || normalized.updatedAt >= local.updatedAt) {
      byId.set(normalized.id, { ...normalized, cloudSyncedAt: normalized.cloudSyncedAt ?? new Date().toISOString() });
    }
  }
  writeAll(
    [...byId.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, PORTFOLIO_SESSION_LIMIT),
  );
}
