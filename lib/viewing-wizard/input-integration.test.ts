import { describe, expect, it } from "vitest";
import {
  applyIntegrationToQuestions,
  mergeAnswerText,
  normalizeIntegrationPayload,
  setDiscoveryStatus,
} from "./input-integration";
import type { WizardQuestion } from "./questions";

describe("input integration merge", () => {
  it("merges answers without overwriting prior text", () => {
    expect(mergeAnswerText("First note", "Second note")).toBe("First note\n—\nSecond note");
    expect(mergeAnswerText("Same", "Same")).toBe("Same");
  });

  it("applies bound updates and appends discovery tickets", () => {
    const questions: WizardQuestion[] = [
      {
        id: 1,
        text: "Check leaks",
        checked: false,
        category: "condition",
        priority: "high",
        source: "viewing_brief",
      },
    ];
    const next = applyIntegrationToQuestions(
      questions,
      normalizeIntegrationPayload(
        {
          boundQuestionUpdates: [
            {
              questionId: 1,
              answerPatch: "Ceiling stain near kitchen",
              status: "answered",
              source: "user_input",
            },
          ],
          discoveryTickets: [
            {
              title: "Ask about recent roof repair invoices",
              category: "costs_docs",
              priority: "high",
              description: "Mentioned water stain",
            },
          ],
        },
        1,
      ),
      { entryId: "e1" },
    );
    expect(next[0]?.answer).toContain("Ceiling stain");
    expect(next.some((q) => q.source === "ai_discovery")).toBe(true);
    expect(next.find((q) => q.source === "ai_discovery")?.discoveryStatus).toBe("pending");
  });

  it("marks uncertain images as needs_more without inventing condition", () => {
    const result = normalizeIntegrationPayload({ imageUncertain: true }, 9);
    expect(result.imageUncertain).toBe(true);
    expect(result.boundQuestionUpdates[0]?.answerPatch).toMatch(/無法確認/);
    expect(result.boundQuestionUpdates[0]?.status).toBe("needs_more");
  });

  it("can ignore discovery tickets", () => {
    const questions: WizardQuestion[] = [
      {
        id: 5,
        text: "New discovery",
        checked: false,
        source: "ai_discovery",
        discoveryStatus: "pending",
      },
    ];
    expect(setDiscoveryStatus(questions, 5, "ignored")[0]?.discoveryStatus).toBe("ignored");
  });

  it("keeps original answer when merging a bound ticket patch", () => {
    const questions: WizardQuestion[] = [
      {
        id: 9,
        text: "Check kitchen",
        checked: true,
        answer: "User raw note",
        category: "condition",
        source: "viewing_brief",
      },
    ];
    const next = applyIntegrationToQuestions(
      questions,
      normalizeIntegrationPayload(
        {
          boundQuestionUpdates: [
            {
              questionId: 9,
              answerPatch: "AI additive patch",
              status: "answered",
              source: "ai_inferred",
            },
          ],
          discoveryTickets: [],
        },
        9,
      ),
    );
    expect(next[0]?.answer).toContain("User raw note");
    expect(next[0]?.answer).toContain("AI additive patch");
  });
});
