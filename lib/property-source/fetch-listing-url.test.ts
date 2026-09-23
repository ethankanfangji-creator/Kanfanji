import { describe, expect, it } from "vitest";
import { looksLikeBotChallengePage } from "./fetch-listing-url";

describe("looksLikeBotChallengePage", () => {
  it("flags Cloudflare interstitial text", () => {
    expect(
      looksLikeBotChallengePage(
        "Just a moment…enable javascripts and cookies to continue.",
      ),
    ).toBe(true);
    expect(looksLikeBotChallengePage("Checking your browser before accessing")).toBe(
      true,
    );
    expect(looksLikeBotChallengePage("Asking $500,000 3 bed condo")).toBe(false);
  });
});
