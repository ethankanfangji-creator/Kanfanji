import { describe, expect, it } from "vitest";
import { sanitizeAnalyticsProps, sanitizeEvent } from "./sanitize";

describe("sanitizeAnalyticsProps", () => {
  it("drops unknown keys and non-enum strings", () => {
    expect(
      sanitizeAnalyticsProps("address_search_started", {
        region: "2143 Clarke St",
        address: "2143 Clarke St",
        lat: 49.2,
        lng: -123.1,
        email: "a@b.co",
        text: "notes",
      }),
    ).toEqual({});
  });

  it("keeps allowlisted enums and finite integers", () => {
    expect(
      sanitizeAnalyticsProps("address_suggestion_selected", {
        source: "google",
        region: "CA",
        rank: 1,
        address: "hidden",
      }),
    ).toEqual({ source: "google", region: "CA", rank: 1 });
  });

  it("rejects a non-integer rank and a count outside 2 or 3", () => {
    expect(
      sanitizeAnalyticsProps("address_suggestion_selected", {
        source: "photon",
        region: "TW",
        rank: 1.5,
      }),
    ).toEqual({ source: "photon", region: "TW" });
    expect(
      sanitizeAnalyticsProps("compare_opened", { count: 6, source: "chat_history", token: "tok_S3CRET" }),
    ).toEqual({ source: "chat_history" });
    expect(
      sanitizeAnalyticsProps("compare_gate_shown", { reason: "nope", source: "chat_history" }),
    ).toEqual({ source: "chat_history" });
  });

  it("refuses an event whose required props were stripped", () => {
    expect(
      sanitizeEvent({
        name: "address_confirmed",
        props: { source: "google", region: "2143 Clarke St" as "CA" },
      }),
    ).toBeNull();
  });

  it("keeps ask funnel enums and bounded counts", () => {
    expect(
      sanitizeEvent({
        name: "ask_opened",
        props: { source: "direct" },
      }),
    ).toEqual({ name: "ask_opened", props: { source: "direct" } });

    expect(
      sanitizeAnalyticsProps("ask_question_sent", {
        scope_mode: "all",
        home_count: 3,
        has_share_comments: true,
        is_rewrite: false,
        rewrite_hint: "none",
        question: "媽媽喜歡哪間",
      }),
    ).toEqual({
      scope_mode: "all",
      home_count: 3,
      has_share_comments: true,
      is_rewrite: false,
      rewrite_hint: "none",
    });

    expect(
      sanitizeEvent({
        name: "ask_answer_received",
        props: { matched_count: 2, suggest_compare: true, has_citations: true },
      }),
    ).toEqual({
      name: "ask_answer_received",
      props: { matched_count: 2, suggest_compare: true, has_citations: true },
    });

    expect(
      sanitizeEvent({
        name: "decision_status_changed",
        props: { status: "shortlist", surface: "ask" },
      }),
    ).toEqual({
      name: "decision_status_changed",
      props: { status: "shortlist", surface: "ask" },
    });

    expect(
      sanitizeEvent({
        name: "compare_opened",
        props: { count: 2, source: "ask" },
      }),
    ).toEqual({ name: "compare_opened", props: { count: 2, source: "ask" } });
  });

  it("rejects ask home_count outside 1–40 and free-text leakage", () => {
    expect(
      sanitizeAnalyticsProps("ask_question_sent", {
        scope_mode: "all",
        home_count: 0,
        has_share_comments: false,
        is_rewrite: false,
        rewrite_hint: "none",
      }),
    ).toEqual({
      scope_mode: "all",
      has_share_comments: false,
      is_rewrite: false,
      rewrite_hint: "none",
    });
  });
});
