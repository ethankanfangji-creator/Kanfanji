import { describe, expect, it } from "vitest";
import { buildViewingReport } from "./build";
import type { WizardQuestion } from "@/lib/viewing-wizard/questions";

describe("buildViewingReport", () => {
  it("groups tickets, preserves originals, and builds category rollups", () => {
    const questions: WizardQuestion[] = [
      {
        id: 1,
        text: "Check leaks at kitchen",
        checked: true,
        answer: "Stain near sink, no active drip",
        category: "condition",
        priority: "high",
        source: "viewing_brief",
      },
      {
        id: 2,
        text: "Walk to SkyTrain",
        checked: false,
        category: "transit",
        priority: "medium",
        source: "viewing_brief",
      },
      {
        id: 3,
        text: "Ask about roof invoice",
        checked: false,
        category: "costs_docs",
        priority: "high",
        source: "ai_discovery",
        discoveryStatus: "pending",
        hint: "AI 新發現",
      },
    ];

    const report = buildViewingReport({
      address: "1200 Westwood St",
      viewingAt: "2026-09-18T18:00:00.000Z",
      unitLabel: "1202",
      priceLabel: "",
      layoutLabel: "2B2B",
      areaLabel: "",
      managementFeeLabel: "",
      listingUrl: "",
      setupNotes: "Quiet evening",
      market: "CA",
      tags: ["condo"],
      localSessionId: "sess-1",
      propertyBasics: {
        address: "1200 Westwood St",
        displayName: { value: "Westwood", confidence: "inferred" },
        propertyType: { value: "condo", confidence: "inferred" },
        layout: { value: null, confidence: "unknown" },
        area: { value: null, confidence: "unknown" },
        price: { value: null, confidence: "unknown" },
        managementFee: { value: null, confidence: "unknown" },
        yearBuilt: { value: "1998", confidence: "inferred" },
        summary: { value: "Mid-rise near transit", confidence: "inferred" },
        sources: ["opendata"],
        generatedAt: "2026-09-18T17:00:00.000Z",
      },
      questions,
      notes: [{ id: 11, transcript: "Smells fresh paint", kind: "text" }],
      photos: [{ id: 21, thumbUrl: "blob:photo", tag: "kitchen", note: "stain" }],
      pros: ["Bright living room"],
      risks: ["Possible leak"],
      aiSummary: null,
      inputLog: [
        {
          id: "e1",
          viewingSessionId: "sess-1",
          createdAt: "2026-09-18T18:10:00.000Z",
          kind: "text",
          original: { text: "Ceiling stain near kitchen" },
          boundQuestionId: 1,
          integration: {
            integratedAt: "2026-09-18T18:10:05.000Z",
            boundQuestionUpdates: [
              {
                questionId: 1,
                answerPatch: "Stain near sink",
                status: "answered",
                source: "user_input",
              },
            ],
            discoveryTickets: [],
            message: "Merged into leak ticket",
          },
        },
      ],
      preserveOriginalsNote: "AI summary complements original user records.",
    });

    expect(report.property.address).toBe("1200 Westwood St");
    expect(report.property.propertyType).toBe("condo");
    expect(report.property.basicsSummary).toMatch(/transit/i);
    expect(report.viewing.viewingAt).toContain("2026-09-18");
    expect(report.tickets.answered).toHaveLength(1);
    expect(report.tickets.unanswered).toHaveLength(1);
    expect(report.tickets.discoveries).toHaveLength(1);
    expect(report.categorySummaries.some((c) => c.category === "condition")).toBe(true);
    expect(report.originalNotes[0]?.text).toBe("Smells fresh paint");
    expect(report.observations[0]?.text).toBe("Ceiling stain near kitchen");
    expect(report.observations[0]?.aiNote).toMatch(/Merged|Stain/);
    expect(report.toConfirm.some((line) => /roof invoice/i.test(line))).toBe(true);
    expect(report.aiIntegration.preserveOriginalsNote).toMatch(/original/i);
    expect(report.photos[0]?.tag).toBe("kitchen");
  });
});
