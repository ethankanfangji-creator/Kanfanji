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
        identity: "guest" | "user";
        endpoint: "turn" | "report" | "intel" | "ingest";
      };
    }
  | { name: "paywall_shown"; props: { trigger: "ai_quota" | "free_limit" } }
  | {
      name: "checkout_started";
      props: { trigger: "ai_quota" | "paywall" | "account" };
    }
  | { name: "subscription_activated"; props: { plan: "pro" } }
  | {
      name: "compare_opened";
      props: { count: 2 | 3; source: "chat_history" | "viewings_list" };
    };

export type AnalyticsEventName = AnalyticsEvent["name"];
