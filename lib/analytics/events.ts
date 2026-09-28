export type AnalyticsRegion = "CA" | "US" | "TW" | "OTHER";
export type AddressSource = "bc_geocoder" | "nominatim" | "google" | "photon";
export type AnalyticsMarket = "US" | "CA" | "TW" | "OTHER";

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
        endpoint: "turn" | "report" | "intel" | "ingest";
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
      props: { count: 2 | 3 | 4 | 5; source: "chat_history" | "viewings_list" };
    }
  | {
      name: "compare_gate_shown";
      props: {
        reason: "login_required" | "upgrade_required" | "too_many_items";
        source: "chat_history" | "viewings_list";
      };
    }
  | { name: "share_created"; props: { kind: "compare" } }
  | { name: "share_viewed"; props: { kind: "compare" } };

export type AnalyticsEventName = AnalyticsEvent["name"];
