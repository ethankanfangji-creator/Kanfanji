import type { AnalyticsEvent, AnalyticsEventName } from "./events";

const REGIONS = new Set(["CA", "US", "TW", "OTHER"]);
const MARKETS = new Set(["US", "CA", "TW", "OTHER"]);
const ADDRESS_SOURCES = new Set(["bc_geocoder", "nominatim", "google", "photon"]);
const COMPARE_SOURCES = new Set(["chat_history", "viewings_list", "ask"]);
const ASK_OPEN_SOURCES = new Set(["nav", "tab", "direct"]);
const SCOPE_MODES = new Set(["all", "time", "ids", "status"]);
const REWRITE_HINTS = new Set(["none", "retry", "shorter", "more_citations", "matches_only"]);
const ASK_REWRITE_HINTS = new Set(["retry", "shorter", "more_citations", "matches_only"]);
const DECISION_STATUSES = new Set(["liked", "shortlist", "passed", "revisit", "none"]);
const DECISION_SURFACES = new Set(["ask", "session", "viewings"]);

const ALLOWED: Record<AnalyticsEventName, ReadonlySet<string>> = {
  address_search_started: new Set(["region"]),
  address_suggestion_selected: new Set(["source", "region", "rank"]),
  address_confirmed: new Set(["source", "region"]),
  address_rejected: new Set(["source", "region"]),
  viewing_created: new Set(["storage", "market"]),
  ai_message_sent: new Set(["kind", "is_reply"]),
  ai_quota_exceeded: new Set(["tier", "endpoint", "limit"]),
  paywall_shown: new Set(["trigger"]),
  checkout_started: new Set(["trigger"]),
  subscription_activated: new Set(["plan"]),
  compare_opened: new Set(["count", "source"]),
  compare_gate_shown: new Set(["reason", "source"]),
  share_created: new Set(["kind"]),
  share_viewed: new Set(["kind"]),
  ask_opened: new Set(["source"]),
  ask_question_sent: new Set([
    "scope_mode",
    "home_count",
    "has_share_comments",
    "is_rewrite",
    "rewrite_hint",
  ]),
  ask_answer_received: new Set(["matched_count", "suggest_compare", "has_citations"]),
  ask_feedback: new Set(["rating"]),
  ask_rewrite: new Set(["hint"]),
  ask_compare_opened: new Set(["count"]),
  decision_status_changed: new Set(["status", "surface"]),
};

const ENUMS: Record<string, ReadonlySet<string>> = {
  region: REGIONS,
  market: MARKETS,
  source: ADDRESS_SOURCES,
  storage: new Set(["local", "cloud"]),
  kind: new Set(["text", "audio", "photo", "file"]),
  tier: new Set(["guest", "free", "pro"]),
  limit: new Set(["tier", "network"]),
  reason: new Set(["login_required", "upgrade_required", "too_many_items"]),
  endpoint: new Set(["turn", "report", "intel", "ingest", "portfolio"]),
  trigger: new Set(["ai_quota", "free_limit", "compare", "paywall", "account"]),
  plan: new Set(["pro"]),
  scope_mode: SCOPE_MODES,
  rewrite_hint: REWRITE_HINTS,
  hint: ASK_REWRITE_HINTS,
  rating: new Set(["like", "dislike"]),
  status: DECISION_STATUSES,
  surface: DECISION_SURFACES,
};

function keepEnum(key: string, value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const allowed = ENUMS[key];
  if (!allowed || !allowed.has(value)) return undefined;
  if (key === "trigger") return value;
  return value;
}

function keepBoundedInt(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  if (value < min || value > max) return undefined;
  return value;
}

function keepValue(event: AnalyticsEventName, key: string, value: unknown): unknown {
  if (key === "rank") {
    return typeof value === "number" && Number.isInteger(value) && value >= 0
      ? value
      : undefined;
  }
  if (key === "count") {
    return value === 2 || value === 3 || value === 4 || value === 5 ? value : undefined;
  }
  if (key === "home_count") return keepBoundedInt(value, 1, 40);
  if (key === "matched_count") return keepBoundedInt(value, 0, 40);
  if (
    key === "is_reply" ||
    key === "has_share_comments" ||
    key === "is_rewrite" ||
    key === "suggest_compare" ||
    key === "has_citations"
  ) {
    return typeof value === "boolean" ? value : undefined;
  }
  if (key === "trigger") {
    const next = keepEnum(key, value);
    if (!next) return undefined;
    if (
      event === "paywall_shown" &&
      next !== "ai_quota" &&
      next !== "free_limit" &&
      next !== "compare"
    ) {
      return undefined;
    }
    if (
      event === "checkout_started" &&
      next !== "ai_quota" &&
      next !== "paywall" &&
      next !== "account"
    ) {
      return undefined;
    }
    return next;
  }
  if (key === "source") {
    if (event === "compare_opened" || event === "compare_gate_shown") {
      return typeof value === "string" && COMPARE_SOURCES.has(value) ? value : undefined;
    }
    if (event === "ask_opened") {
      return typeof value === "string" && ASK_OPEN_SOURCES.has(value) ? value : undefined;
    }
    return keepEnum("source", value);
  }
  if (key === "kind" && (event === "share_created" || event === "share_viewed")) {
    return value === "compare" ? value : undefined;
  }
  if (typeof value === "string" && /^[A-Za-z0-9_-]{20,}$/.test(value) && !ENUMS[key]?.has(value)) {
    return undefined;
  }
  return keepEnum(key, value);
}

/** Drop unknown keys and any value that is not an allowlisted enum, boolean, or finite integer. */
export function sanitizeAnalyticsProps(
  name: AnalyticsEventName,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = ALLOWED[name];
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!allowed.has(key)) continue;
    const kept = keepValue(name, key, value);
    if (kept !== undefined) next[key] = kept;
  }
  return next;
}

export function sanitizeEvent(event: AnalyticsEvent): AnalyticsEvent | null {
  const props = sanitizeAnalyticsProps(
    event.name,
    event.props as unknown as Record<string, unknown>,
  );
  if (Object.keys(props).length !== Object.keys(event.props).length) return null;
  return { name: event.name, props } as AnalyticsEvent;
}
