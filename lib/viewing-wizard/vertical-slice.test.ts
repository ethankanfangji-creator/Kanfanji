/**
 * Minimal vertical-slice contract tests:
 * address confirm → start viewing → field content → report-ready → share auth gate.
 */
import { describe, expect, it } from "vitest";
import { buildViewingReport } from "@/lib/viewing-report/build";
import { createMockShareService } from "@/lib/services/share/types";
import {
  applyIntegrationToQuestions,
  mergeAnswerText,
  normalizeIntegrationPayload,
} from "./input-integration";
import type { WizardQuestion } from "./questions";
import {
  canCreateCloudViewing,
  canStartLocalViewing,
} from "./free-tier";
import {
  canEnterStep,
  canGenerateShareCard,
  isStep1Complete,
  isViewingStarted,
} from "./readiness";

describe("vertical slice: address → start → integrate → report → share gate", () => {
  it("blocks Step 2 until address is confirmed AND viewing is started", () => {
    const empty = {
      address: "1200 Westwood",
      identified: false,
      viewingStarted: false,
      viewingAt: "",
      notesCount: 0,
      photosCount: 0,
      clipsCount: 0,
      checkedQuestions: 0,
    };
    expect(isStep1Complete(empty)).toBe(false);
    expect(canEnterStep(2, empty)).toBe(false);

    const confirmed = { ...empty, identified: true };
    expect(isStep1Complete(confirmed)).toBe(true);
    expect(isViewingStarted(confirmed)).toBe(false);
    expect(canEnterStep(2, confirmed)).toBe(false);

    expect(canEnterStep(2, { ...confirmed, viewingStarted: true })).toBe(true);
  });

  it("merges one composer input into a bound ticket without overwriting", () => {
    const questions: WizardQuestion[] = [
      {
        id: 1,
        text: "Any water stains?",
        checked: true,
        answer: "User saw a mark near the window",
        category: "condition",
        priority: "high",
        source: "viewing_brief",
      },
    ];
    const integration = normalizeIntegrationPayload(
      {
        boundQuestionUpdates: [
          {
            questionId: 1,
            answerPatch: "AI: likely condensation, confirm with seller",
            status: "answered",
            source: "ai_inferred",
          },
        ],
        discoveryTickets: [
          {
            title: "Ask for roof inspection report",
            category: "costs_docs",
            priority: "medium",
            description: "Stain may relate to roof",
          },
        ],
      },
      1,
    );
    const next = applyIntegrationToQuestions(questions, integration, { entryId: "e1" });
    expect(next[0]?.answer).toContain("User saw a mark");
    expect(next[0]?.answer).toContain("AI: likely condensation");
    expect(
      mergeAnswerText("User saw a mark near the window", "AI: likely condensation"),
    ).toContain("User saw a mark");
    expect(next.some((q) => q.source === "ai_discovery")).toBe(true);
  });

  it("builds a Step 3 report from current viewing tickets only", () => {
    const report = buildViewingReport({
      address: "1200 Westwood St, Coquitlam, BC",
      viewingAt: "2026-09-19T12:00:00.000Z",
      unitLabel: "",
      priceLabel: "",
      layoutLabel: "",
      areaLabel: "",
      managementFeeLabel: "",
      listingUrl: "",
      setupNotes: "",
      market: "CA",
      tags: [],
      localSessionId: "session-1",
      propertyBasics: null,
      questions: [
        {
          id: 1,
          text: "Any water stains?",
          checked: true,
          answer: "User saw a mark near the window",
          category: "condition",
          priority: "high",
          source: "viewing_brief",
        },
      ],
      notes: [],
      photos: [],
      pros: [],
      risks: [],
      aiSummary: null,
      inputLog: [
        {
          id: "e1",
          viewingSessionId: "session-1",
          createdAt: "2026-09-19T12:01:00.000Z",
          kind: "text",
          original: { text: "User saw a mark near the window" },
          boundQuestionId: 1,
          integration: {
            integratedAt: "2026-09-19T12:01:05.000Z",
            boundQuestionUpdates: [
              {
                questionId: 1,
                answerPatch: "User saw a mark near the window",
                status: "answered",
                source: "user_input",
              },
            ],
            discoveryTickets: [],
            message: "Merged into ticket",
          },
        },
      ],
      preserveOriginalsNote: "AI summary complements original user records.",
    });
    expect(report.property.address).toContain("Westwood");
    expect(report.tickets.answered.length).toBeGreaterThanOrEqual(1);
    expect(report.observations.some((o) => (o.text ?? "").includes("User saw"))).toBe(true);
  });

  it("blocks guest second room and unconfigured share; local report checklist stays usable", async () => {
    expect(
      canStartLocalViewing({ authenticated: false, localViewingCount: 1 }),
    ).toEqual({ allowed: false, reason: "login_required" });
    expect(
      canCreateCloudViewing({
        viewingId: null,
        freeCount: 0,
        isPro: false,
        authenticated: false,
      }),
    ).toEqual({ allowed: false, reason: "login_required" });

    const unconfigured = createMockShareService("unconfigured");
    const denied = await unconfigured.createLink({ viewingId: "v1", userId: "u1" });
    expect(denied.ok).toBe(false);

    // Local report readiness does not require auth; ClientPage LoginGates cloud share.
    expect(
      canGenerateShareCard({
        address: "A",
        viewingAt: "2026-09-19T00:00:00.000Z",
        notesCount: 1,
        photosCount: 0,
        clipsCount: 0,
        checkedQuestions: 0,
        authenticated: false,
      }),
    ).toBe(true);
  });
});
