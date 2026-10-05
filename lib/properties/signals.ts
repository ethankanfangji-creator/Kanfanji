import type { SupabaseClient } from "@supabase/supabase-js";
import { coerceDecisionStatus } from "@/lib/portfolio/decision-status";
import type { DecisionStatus } from "@/lib/portfolio/types";
import {
  ASK_QUESTION_THEMES,
  type AskQuestionTheme,
} from "@/lib/portfolio/question-themes";

export type ThemeCounts = Partial<Record<AskQuestionTheme, number>>;

export type PropertySignalsSnapshot = {
  property_id: string;
  viewing_count: number;
  unique_viewer_count: number;
  liked_count: number;
  shortlist_count: number;
  passed_count: number;
  revisit_count: number;
  decision_set_count: number;
  theme_counts: ThemeCounts;
  ask_hit_count: number;
  last_ask_at: string | null;
  last_viewing_at: string | null;
  refreshed_at: string;
};

export type ViewingSignalRow = {
  user_id: string;
  chat_state?: unknown;
  updated_at?: string | null;
  created_at?: string | null;
};

const THEME_SET = new Set<string>(ASK_QUESTION_THEMES);

export function normalizeThemeCounts(raw: unknown): ThemeCounts {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ThemeCounts = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!THEME_SET.has(key)) continue;
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n) || n <= 0) continue;
    out[key as AskQuestionTheme] = Math.min(1_000_000, Math.floor(n));
  }
  return out;
}

export function mergeThemeCounts(
  base: ThemeCounts,
  increment: readonly AskQuestionTheme[],
): ThemeCounts {
  const next = { ...normalizeThemeCounts(base) };
  for (const theme of increment) {
    if (!THEME_SET.has(theme)) continue;
    next[theme] = Math.min(1_000_000, (next[theme] ?? 0) + 1);
  }
  return next;
}

/** Pure aggregate from viewing rows linked to one property. */
export function computePropertySignals(
  propertyId: string,
  rows: ViewingSignalRow[],
  extras?: {
    theme_counts?: ThemeCounts;
    ask_hit_count?: number;
    last_ask_at?: string | null;
    now?: string;
  },
): PropertySignalsSnapshot {
  const viewers = new Set<string>();
  const counts: Record<DecisionStatus, number> = {
    liked: 0,
    shortlist: 0,
    passed: 0,
    revisit: 0,
  };
  let lastViewingAt: string | null = null;

  for (const row of rows) {
    if (row.user_id) viewers.add(row.user_id);
    const status = coerceDecisionStatus(
      row.chat_state && typeof row.chat_state === "object" && !Array.isArray(row.chat_state)
        ? (row.chat_state as { decisionStatus?: unknown }).decisionStatus
        : null,
    );
    if (status) counts[status] += 1;

    const stamp = row.updated_at || row.created_at || null;
    if (stamp && (!lastViewingAt || stamp > lastViewingAt)) {
      lastViewingAt = stamp;
    }
  }

  const decision_set_count =
    counts.liked + counts.shortlist + counts.passed + counts.revisit;

  return {
    property_id: propertyId,
    viewing_count: rows.length,
    unique_viewer_count: viewers.size,
    liked_count: counts.liked,
    shortlist_count: counts.shortlist,
    passed_count: counts.passed,
    revisit_count: counts.revisit,
    decision_set_count,
    theme_counts: normalizeThemeCounts(extras?.theme_counts),
    ask_hit_count: Math.max(0, Math.floor(extras?.ask_hit_count ?? 0)),
    last_ask_at: extras?.last_ask_at ?? null,
    last_viewing_at: lastViewingAt,
    refreshed_at: extras?.now ?? new Date().toISOString(),
  };
}

function readAskExtras(existing: {
  theme_counts?: unknown;
  ask_hit_count?: unknown;
  last_ask_at?: unknown;
} | null) {
  return {
    theme_counts: normalizeThemeCounts(existing?.theme_counts),
    ask_hit_count:
      typeof existing?.ask_hit_count === "number" && Number.isFinite(existing.ask_hit_count)
        ? Math.max(0, Math.floor(existing.ask_hit_count))
        : 0,
    last_ask_at:
      typeof existing?.last_ask_at === "string" ? existing.last_ask_at : null,
  };
}

/**
 * Recompute viewing/decision aggregates for one property.
 * Preserves Ask theme fields already stored on the row.
 * Soft-fails (returns null) so product paths are never blocked.
 */
export async function refreshPropertySignals(
  admin: SupabaseClient,
  propertyId: string | null | undefined,
): Promise<PropertySignalsSnapshot | null> {
  if (!propertyId || typeof propertyId !== "string") return null;
  try {
    const [{ data, error }, existing] = await Promise.all([
      admin
        .from("viewings")
        .select("user_id, chat_state, updated_at, created_at")
        .eq("property_id", propertyId),
      admin
        .from("property_signals")
        .select("theme_counts, ask_hit_count, last_ask_at")
        .eq("property_id", propertyId)
        .maybeSingle(),
    ]);
    if (error) throw error;
    if (existing.error) throw existing.error;

    const askExtras = readAskExtras(
      (existing.data as {
        theme_counts?: unknown;
        ask_hit_count?: unknown;
        last_ask_at?: unknown;
      } | null) ?? null,
    );
    const snapshot = computePropertySignals(
      propertyId,
      (data ?? []) as ViewingSignalRow[],
      askExtras,
    );

    const hasAskSignal =
      snapshot.ask_hit_count > 0 || Object.keys(snapshot.theme_counts).length > 0;
    if (snapshot.viewing_count === 0 && !hasAskSignal) {
      const { error: delError } = await admin
        .from("property_signals")
        .delete()
        .eq("property_id", propertyId);
      if (delError) throw delError;
      return snapshot;
    }

    const { error: upsertError } = await admin
      .from("property_signals")
      .upsert(snapshot, { onConflict: "property_id" });
    if (upsertError) throw upsertError;
    return snapshot;
  } catch (error) {
    console.error("[refreshPropertySignals]", propertyId, error);
    return null;
  }
}

/**
 * Attribute Ask themes to properties linked from viewing ids (matched homes,
 * else caller passes all card ids). Soft-fails.
 */
export async function recordPropertyAskThemes(
  admin: SupabaseClient,
  input: {
    viewingIds: string[];
    themes: readonly AskQuestionTheme[];
  },
): Promise<number> {
  const themes = input.themes.filter((t) => THEME_SET.has(t));
  const viewingIds = [
    ...new Set(input.viewingIds.map((id) => id.trim()).filter((id) => id.length > 0)),
  ].slice(0, 40);
  if (themes.length === 0 || viewingIds.length === 0) return 0;

  try {
    const { data: rows, error } = await admin
      .from("viewings")
      .select("id, property_id")
      .in("id", viewingIds);
    if (error) throw error;

    const propertyIds = [
      ...new Set(
        (rows ?? [])
          .map((row) =>
            typeof row.property_id === "string" ? row.property_id : null,
          )
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (propertyIds.length === 0) return 0;

    const now = new Date().toISOString();
    let updated = 0;
    for (const propertyId of propertyIds) {
      // Keep viewing/decision side fresh, then bump Ask fields.
      await refreshPropertySignals(admin, propertyId);
      const existing = await admin
        .from("property_signals")
        .select(
          "viewing_count, unique_viewer_count, liked_count, shortlist_count, passed_count, revisit_count, decision_set_count, theme_counts, ask_hit_count, last_ask_at, last_viewing_at",
        )
        .eq("property_id", propertyId)
        .maybeSingle();
      if (existing.error) throw existing.error;

      const prior = existing.data as Omit<PropertySignalsSnapshot, "property_id" | "refreshed_at"> | null;
      const row: PropertySignalsSnapshot = {
        property_id: propertyId,
        viewing_count: prior?.viewing_count ?? 0,
        unique_viewer_count: prior?.unique_viewer_count ?? 0,
        liked_count: prior?.liked_count ?? 0,
        shortlist_count: prior?.shortlist_count ?? 0,
        passed_count: prior?.passed_count ?? 0,
        revisit_count: prior?.revisit_count ?? 0,
        decision_set_count: prior?.decision_set_count ?? 0,
        theme_counts: mergeThemeCounts(normalizeThemeCounts(prior?.theme_counts), themes),
        ask_hit_count: (prior?.ask_hit_count ?? 0) + 1,
        last_ask_at: now,
        last_viewing_at: prior?.last_viewing_at ?? null,
        refreshed_at: now,
      };

      const { error: upsertError } = await admin
        .from("property_signals")
        .upsert(row, { onConflict: "property_id" });
      if (upsertError) throw upsertError;
      updated += 1;
    }
    return updated;
  } catch (error) {
    console.error("[recordPropertyAskThemes]", error);
    return 0;
  }
}

/** Fire-and-forget refresh; never throws. */
export function schedulePropertySignalsRefresh(
  admin: SupabaseClient,
  propertyId: string | null | undefined,
): void {
  if (!propertyId) return;
  void refreshPropertySignals(admin, propertyId);
}

/** Fire-and-forget Ask theme attribution; never throws. */
export function schedulePropertyAskThemes(
  admin: SupabaseClient,
  input: {
    viewingIds: string[];
    themes: readonly AskQuestionTheme[];
  },
): void {
  void recordPropertyAskThemes(admin, input);
}
