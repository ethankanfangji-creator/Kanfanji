import { describe, expect, it } from "vitest";
import { applyViewingCardChange } from "./live-card-sync";

describe("applyViewingCardChange", () => {
  const cards = [
    {
      templateId: "light",
      name: "採光",
      icon: "☀️",
      sortOrder: 2,
      isSystem: true,
      status: null,
      notes: null,
      voiceTranscript: null,
      photoCount: 0,
    },
  ];

  it("updates one card status and photo count without touching the other fields", () => {
    const next = applyViewingCardChange(cards, {
      template_id: "light",
      status: "good",
      notes: "窗邊很亮",
      photos: ["owner/view/photos/card/a.jpg"],
    });
    expect(next[0]).toMatchObject({
      status: "good",
      notes: "窗邊很亮",
      photoCount: 1,
    });
    expect(next).not.toBe(cards);
  });
});
