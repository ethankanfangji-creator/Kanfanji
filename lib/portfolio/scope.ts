import { coerceDecisionStatus } from "./decision-status";
import { effectiveViewingTags, tagsInclude } from "./viewing-tags";
import type { DecisionStatus, PortfolioScope } from "./types";

export type ScopeThread = {
  id: string;
  address: string;
  normalizedAddress?: string | null;
  updatedAt: string;
  createdAt?: string;
  decisionStatus?: DecisionStatus | null;
  tags?: string[] | null;
};

export function startOfLocalDayIso(now = new Date()): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function daysAgoIso(days: number, now = new Date()): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/** Filter threads by portfolio scope. Address search is applied separately in UI lists. */
export function filterThreadsByScope<T extends ScopeThread>(
  threads: T[],
  scope: PortfolioScope,
): T[] {
  const mode = scope.mode ?? "all";
  if (mode === "all") return threads;

  if (mode === "ids") {
    const allow = new Set((scope.viewingIds ?? []).filter(Boolean));
    if (allow.size === 0) return [];
    return threads.filter((thread) => allow.has(thread.id));
  }

  if (mode === "time") {
    const since = scope.since?.trim();
    if (!since) return threads;
    const sinceMs = Date.parse(since);
    if (!Number.isFinite(sinceMs)) return threads;
    return threads.filter((thread) => {
      const ts = Date.parse(thread.updatedAt || thread.createdAt || "");
      return Number.isFinite(ts) && ts >= sinceMs;
    });
  }

  if (mode === "status") {
    const statuses = new Set(scope.statuses ?? []);
    if (statuses.size === 0) return [];
    return threads.filter((thread) => {
      const tags = effectiveViewingTags({
        tags: thread.tags,
        decisionStatus: thread.decisionStatus,
      });
      for (const status of statuses) {
        if (tagsInclude(tags, status)) return true;
      }
      // Legacy rows that only have decisionStatus (already covered by effective tags).
      const status = coerceDecisionStatus(thread.decisionStatus);
      return status != null && statuses.has(status);
    });
  }

  return threads;
}

export function scopeLabelKey(scope: PortfolioScope): string {
  if (scope.mode === "ids") return "ids";
  if (scope.mode === "time") {
    if (!scope.since) return "all";
    return "time";
  }
  if (scope.mode === "status") return "status";
  return "all";
}

export function defaultPortfolioScope(): PortfolioScope {
  return { mode: "all" };
}
