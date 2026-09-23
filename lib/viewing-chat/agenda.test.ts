import { describe, expect, it } from "vitest";
import {
  countAgendaProgress,
  inferAgendaMarket,
  openingAgendaActiveId,
  projectAgenda,
  resolveNextActiveId,
  suggestTopicFromUserText,
} from "./agenda";
import { listAgendaSeedsForMarket } from "./agenda-catalog";
import { createAiMessage, createUserMessage } from "./types";

const resolveLabels = (seed: { id: string; category: string }) => ({
  question: seed.id,
  category: seed.category,
});

describe("on-site agenda catalog", () => {
  it("opens with exterior as first universal item", () => {
    const market = "OTHER" as const;
    expect(openingAgendaActiveId(market)).toBe("q_exterior");
    const agenda = projectAgenda({
      messages: [],
      activeId: openingAgendaActiveId(market),
      market,
      resolveLabels,
    });
    expect(agenda[0]?.id).toBe("q_exterior");
    expect(agenda[0]?.status).toBe("active");
    expect(agenda.filter((i) => i.status === "active")).toHaveLength(1);
  });

  it("appends TW market pack items", () => {
    const ids = listAgendaSeedsForMarket("TW").map((s) => s.id);
    expect(ids).toContain("q_tw_moisture");
    expect(ids).toContain("q_tw_docs");
    expect(ids.indexOf("q_tw_moisture")).toBeGreaterThan(
      ids.indexOf("q_water_damage"),
    );
  });

  it("infers market from address", () => {
    expect(inferAgendaMarket("台北市大安區忠孝東路")).toBe("TW");
    expect(inferAgendaMarket("456 Granville St, Vancouver, BC")).toBe("CA");
    expect(inferAgendaMarket("123 Main St, Seattle, WA 98101")).toBe("US");
  });

  it("maps legacy fill ids and advances in walk order", () => {
    const messages = [
      createUserMessage({ type: "text", text: "外牆看起來還好" }),
      createAiMessage({
        type: "fill",
        text: "記到了",
        matched: [{ id: "q_exterior", answer: "外觀正常" }],
      }),
    ];
    const agenda = projectAgenda({
      messages,
      activeId: "q_exterior",
      market: "OTHER",
      resolveLabels,
    });
    expect(agenda.find((i) => i.id === "q_exterior")?.status).toBe("answered");

    const next = resolveNextActiveId({
      agenda,
      currentActiveId: "q_exterior",
      agendaAction: "advance",
      matchedIds: ["q_exterior"],
    });
    expect(next).toBe("q_odor");
  });

  it("red-flag smell sticks to q_odor with probe hint", () => {
    const agenda = projectAgenda({
      messages: [],
      activeId: "q_exterior",
      market: "OTHER",
      resolveLabels,
    });
    const hit = suggestTopicFromUserText("一進門就有霉味", agenda);
    expect(hit?.agendaId).toBe("q_odor");
    expect(hit?.redFlagProbeEn).toMatch(/smell/i);
  });

  it("legacy q_panel fills q_electrical", () => {
    const messages = [
      createAiMessage({
        type: "fill",
        text: "ok",
        matched: [{ id: "q_panel", answer: "Federal 100A" }],
      }),
    ];
    const agenda = projectAgenda({
      messages,
      activeId: "q_electrical",
      market: "OTHER",
      resolveLabels,
    });
    expect(agenda.find((i) => i.id === "q_electrical")?.answer).toBe(
      "Federal 100A",
    );
  });

  it("ignores nextItemId that equals the current item", () => {
    const messages = [
      createAiMessage({
        type: "fill",
        text: "ok",
        matched: [{ id: "q_exterior", answer: "沒有" }],
      }),
    ];
    const agenda = projectAgenda({
      messages,
      activeId: "q_exterior",
      market: "OTHER",
      resolveLabels,
    });
    // Exterior answered via fill
    expect(agenda.find((i) => i.id === "q_exterior")?.status).toBe("answered");

    const next = resolveNextActiveId({
      agenda: projectAgenda({
        messages: [],
        activeId: "q_exterior",
        market: "OTHER",
        resolveLabels,
      }),
      currentActiveId: "q_exterior",
      agendaAction: "advance",
      nextItemId: "q_exterior", // LLM mistake
      matchedIds: ["q_exterior"],
    });
    expect(next).toBe("q_odor");
  });
});
