import { describe, expect, it } from "vitest";
import type { AgendaItem } from "./agenda";
import { sanitizeAnalysisNote, sanitizeMatchedHits, pinMatchedToActiveTopic } from "./sanitize-turn";

function item(
  partial: Partial<AgendaItem> & Pick<AgendaItem, "id" | "question" | "status">,
): AgendaItem {
  return {
    category: "屋況",
    priority: "high",
    answer: "",
    pack: "universal",
    whyEn: "test",
    ...partial,
  };
}

describe("sanitizeMatchedHits", () => {
  const agenda = [
    item({
      id: "q_tw_moisture",
      question: "壁癌、窗框滲水、異常新漆有沒有？",
      status: "active",
    }),
    item({
      id: "q_electrical",
      question: "電箱、插座數量、潮濕區保護？",
      status: "pending",
    }),
  ];

  it("replaces echoed checklist questions with the user payload", () => {
    const hits = sanitizeMatchedHits({
      matched: [
        {
          id: "q_tw_moisture",
          answer: "壁癌、窗框滲水、異常新漆有沒有？",
        },
      ],
      agenda,
      userPayload: "壁癌",
    });
    expect(hits).toEqual([{ id: "q_tw_moisture", answer: "壁癌" }]);
  });

  it("keeps real short answers", () => {
    const hits = sanitizeMatchedHits({
      matched: [{ id: "q_tw_moisture", answer: "有壁癌，窗邊明顯" }],
      agenda,
      userPayload: "有壁癌，窗邊明顯",
    });
    expect(hits[0]?.answer).toBe("有壁癌，窗邊明顯");
  });
});

describe("pinMatchedToActiveTopic", () => {
  it("pins short「沒有」to active exterior, not the next smell item", () => {
    const hits = pinMatchedToActiveTopic({
      matched: [{ id: "q_odor", answer: "沒有" }],
      activeId: "q_exterior",
      nextItemId: "q_odor",
      userPayload: "沒有",
    });
    expect(hits).toEqual([{ id: "q_exterior", answer: "沒有" }]);
  });

  it("remaps fill on nextItemId back to active", () => {
    const hits = pinMatchedToActiveTopic({
      matched: [{ id: "q_odor", answer: "進門沒怪味" }],
      activeId: "q_exterior",
      nextItemId: "q_odor",
      userPayload: "外牆沒問題，進門也沒怪味",
    });
    expect(hits[0]?.id).toBe("q_exterior");
  });
});

describe("sanitizeAnalysisNote", () => {
  const agenda = [
    item({
      id: "q_electrical",
      question: "電箱、插座數量、潮濕區保護？",
      status: "pending",
    }),
  ];

  it("drops next-topic dumps and questions", () => {
    expect(
      sanitizeAnalysisNote({
        analysis: "需要確認電箱和插座的數量，以及潮濕區域的保護情況。",
        coachText: "了解，壁癌的問題需要特別注意。請問污漬在哪？",
        agenda,
      }),
    ).toBeUndefined();
  });

  it("keeps short risk notes about this turn", () => {
    expect(
      sanitizeAnalysisNote({
        analysis: "霉味可能是水分問題的信號，需進一步檢查。",
        coachText: "有點發霉可能與壁癌有關。你有注意到異常新漆嗎？",
        agenda,
      }),
    ).toBe("霉味可能是水分問題的信號，需進一步檢查。");
  });
});
