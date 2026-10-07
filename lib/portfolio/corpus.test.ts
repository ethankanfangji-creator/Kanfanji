import { describe, expect, it } from "vitest";
import type { ViewingChatThread } from "@/lib/viewing-chat/types";
import { filterThreadsForAccount } from "@/lib/viewing-chat/local-store";
import {
  buildPortfolioCorpus,
  formatCorpusForPrompt,
  mergeShareCommentsIntoCards,
  validateFactCards,
} from "./corpus";

function thread(partial: Partial<ViewingChatThread> & { id: string; address: string }): ViewingChatThread {
  return {
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
    messages: [],
    report: null,
    metadata: null,
    ...partial,
  } as ViewingChatThread;
}

describe("buildPortfolioCorpus", () => {
  it("reads price/layout from propertyRecord and report pros", () => {
    const cards = buildPortfolioCorpus([
      thread({
        id: "v1",
        address: "88 Test St",
        decisionStatus: "shortlist",
        propertyRecord: {
          fields: {
            price: { value: "1400000", status: "confirmed" },
            layout: { value: "3房2廳", status: "confirmed" },
          },
        } as ViewingChatThread["propertyRecord"],
        report: {
          pros: ["採光佳"],
          risks: ["噪音"],
          followUps: [],
          checklist: [],
          summary: "不錯",
          generatedAt: "2026-10-02T00:00:00.000Z",
        },
        messages: [
          {
            id: "m1",
            role: "user",
            type: "text",
            timestamp: "2026-10-02T00:00:00.000Z",
            text: "客廳很亮",
          },
        ],
      }),
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0].price).toContain("1400000");
    expect(cards[0].layout).toBe("3房2廳");
    expect(cards[0].pros).toEqual(["採光佳"]);
    expect(cards[0].decisionStatus).toBe("shortlist");
    expect(cards[0].notesExcerpt).toContain("客廳很亮");
    expect(cards[0].shareComments).toEqual([]);
  });
});

describe("share comments in corpus", () => {
  it("merges external comments and formats them separately from notes", () => {
    const [base] = buildPortfolioCorpus([
      thread({
        id: "v1",
        address: "88 Test St",
        messages: [
          {
            id: "m1",
            role: "user",
            type: "text",
            timestamp: "2026-10-02T00:00:00.000Z",
            text: "客廳很亮",
          },
        ],
      }),
    ]);
    const merged = mergeShareCommentsIntoCards([base], {
      v1: [
        {
          authorLabel: "媽媽",
          body: "這間採光最好，我比較喜歡",
          createdAt: "2026-10-03T00:00:00.000Z",
        },
      ],
      missing: [{ authorLabel: "x", body: "should ignore" }],
    });
    expect(merged[0].shareComments).toHaveLength(1);
    expect(merged[0].shareComments[0].authorLabel).toBe("媽媽");

    const prompt = formatCorpusForPrompt(merged);
    expect(prompt).toContain("EXTERNAL_COMMENTS (from share link, not owner notes):");
    expect(prompt).toContain("[媽媽]");
    expect(prompt).toContain("這間採光最好，我比較喜歡");
    expect(prompt).toContain("notes:");
    expect(prompt).toContain("客廳很亮");
  });

  it("tolerates empty or missing comment maps", () => {
    const [base] = buildPortfolioCorpus([thread({ id: "v2", address: "A" })]);
    expect(mergeShareCommentsIntoCards([base], {})[0].shareComments).toEqual([]);
    expect(mergeShareCommentsIntoCards([base], { v2: [] })[0].shareComments).toEqual([]);
    expect(
      mergeShareCommentsIntoCards([base], { v2: [{ authorLabel: "x", body: "   " }] })[0]
        .shareComments,
    ).toEqual([]);
  });
});

describe("validateFactCards", () => {
  it("drops invalid ids and caps fields", () => {
    const cards = validateFactCards([
      { id: "bad id!", address: "x" },
      {
        id: "ok_1",
        address: "Home",
        price: "1M",
        pros: ["a", "b"],
        fields: { noise: "quiet" },
        shareComments: [{ authorLabel: "媽媽", body: "喜歡這間" }],
      },
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("ok_1");
    expect(cards[0].price).toBe("1M");
    expect(cards[0].fields.noise).toBe("quiet");
    expect(cards[0].shareComments).toEqual([
      { authorLabel: "媽媽", body: "喜歡這間", createdAt: "" },
    ]);
  });

  it("defaults shareComments when omitted", () => {
    const cards = validateFactCards([{ id: "ok_2", address: "B" }]);
    expect(cards[0].shareComments).toEqual([]);
  });

  it("does not put another account's leftover notes into the Ask corpus", () => {
    const cards = buildPortfolioCorpus(
      filterThreadsForAccount(
        [
          thread({
            id: "alice-home",
            address: "12 Secret Lane",
            ownerUserId: "alice",
            messages: [
              {
                id: "n1",
                role: "user",
                type: "text",
                timestamp: "2026-10-02T00:00:00.000Z",
                text: "預算只有 Alice 知道",
              },
            ],
          }),
          thread({
            id: "bob-home",
            address: "88 Shared St",
            ownerUserId: "bob",
            messages: [
              {
                id: "n2",
                role: "user",
                type: "text",
                timestamp: "2026-10-02T00:00:00.000Z",
                text: "Bob 的筆記",
              },
            ],
          }),
        ],
        "bob",
      ),
    );
    expect(cards.map((card) => card.id)).toEqual(["bob-home"]);
    expect(cards[0].notesExcerpt).toContain("Bob 的筆記");
    expect(JSON.stringify(cards)).not.toContain("Alice");
    expect(JSON.stringify(cards)).not.toContain("Secret Lane");
  });
});
