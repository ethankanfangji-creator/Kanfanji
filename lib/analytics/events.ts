export type AnalyticsRegion = "CA" | "US" | "TW" | "OTHER";
export type AddressSource = "bc_geocoder" | "nominatim" | "google" | "photon";
export type AnalyticsMarket = "US" | "CA" | "TW" | "OTHER";

export type AskOpenSource = "nav" | "tab" | "direct";
export type AskScopeMode = "all" | "time" | "ids" | "status";
export type AskRewriteHint = "none" | "retry" | "shorter" | "more_citations" | "matches_only";
export type DecisionStatusAnalytics =
  | "liked"
  | "shortlist"
  | "passed"
  | "revisit"
  | "none";
export type DecisionSurface = "ask" | "session" | "viewings";
export type CompareSource = "chat_history" | "viewings_list" | "ask";

export type AnalyticsEvent =
  | { name: "address_search_started"; props: { region: AnalyticsRegion } }
  | {
      name: "address_suggestion_selected";
      props: { source: AddressSource; region: AnalyticsRegion; rank: number };
    }
  | {
      name: "address_confirmed";
      props: { source: AddressSource; region: AnalyticsRegion };
    }
  | {
      name: "address_rejected";
      props: { source: AddressSource; region: AnalyticsRegion };
    }
  | {
      name: "viewing_created";
      props: { storage: "local" | "cloud"; market: AnalyticsMarket };
    }
  | {
      name: "ai_message_sent";
      props: { kind: "text" | "audio" | "photo" | "file"; is_reply: boolean };
    }
  | {
      name: "ai_quota_exceeded";
      props: {
        tier: "guest" | "free" | "pro";
        endpoint: "turn" | "report" | "intel" | "ingest" | "portfolio";
        limit: "tier" | "network";
      };
    }
  | { name: "paywall_shown"; props: { trigger: "ai_quota" | "free_limit" | "compare" } }
  | {
      name: "checkout_started";
      props: { trigger: "ai_quota" | "paywall" | "account" };
    }
  | { name: "subscription_activated"; props: { plan: "pro" } }
  | {
      name: "compare_opened";
      props: { count: 2 | 3 | 4 | 5; source: CompareSource };
    }
  | {
      name: "compare_gate_shown";
      props: {
        reason: "login_required" | "upgrade_required" | "too_many_items";
        source: CompareSource;
      };
    }
  | { name: "share_created"; props: { kind: "compare" } }
  | { name: "share_viewed"; props: { kind: "compare" } }
  | { name: "ask_opened"; props: { source: AskOpenSource } }
  | {
      name: "ask_question_sent";
      props: {
        scope_mode: AskScopeMode;
        home_count: number;
        has_share_comments: boolean;
        is_rewrite: boolean;
        rewrite_hint: AskRewriteHint;
      };
    }
  | {
      name: "ask_answer_received";
      props: {
        matched_count: number;
        suggest_compare: boolean;
        has_citations: boolean;
      };
    }
  | { name: "ask_feedback"; props: { rating: "like" | "dislike" } }
  | {
      name: "ask_rewrite";
      props: { hint: Exclude<AskRewriteHint, "none"> };
    }
  | { name: "ask_compare_opened"; props: { count: 2 | 3 | 4 | 5 } }
  | {
      name: "decision_status_changed";
      props: { status: DecisionStatusAnalytics; surface: DecisionSurface };
    };

export type AnalyticsEventName = AnalyticsEvent["name"];
