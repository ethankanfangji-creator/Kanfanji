import { describe, expect, it } from "vitest";
import {
  buildViewingBriefTickets,
  countHighPriorityOpenTickets,
  ensureViewingBriefQuestions,
  partitionByCategory,
  resolveTicketStatus,
  VIEWING_BRIEF_CATEGORIES,
} from "./viewing-brief";

describe("viewing brief tickets", () => {
  it("covers required categories with address-specific titles", () => {
    const tickets = buildViewingBriefTickets({
      address: "1200 Westwood St, Coquitlam, BC",
      market: "CA",
      neighborhood: "Burquitlam",
      openData: { city: "Coquitlam", zoningCode: "RM-4", pid: "012-345-678" },
      propertyBasics: {
        address: "1200 Westwood St, Coquitlam, BC",
        displayName: { value: "Westwood Tower", confidence: "inferred" },
        propertyType: { value: "condo", confidence: "inferred" },
        layout: { value: null, confidence: "unknown" },
        area: { value: null, confidence: "unknown" },
        price: { value: null, confidence: "unknown" },
        managementFee: { value: null, confidence: "unknown" },
        yearBuilt: { value: null, confidence: "unknown" },
        summary: { value: null, confidence: "unknown" },
        sources: [],
        generatedAt: "2026-09-18T00:00:00.000Z",
      },
    });

    const categories = new Set(tickets.map((t) => t.category));
    for (const category of VIEWING_BRIEF_CATEGORIES) {
      expect(categories.has(category)).toBe(true);
    }
    expect(tickets.some((t) => t.text.includes("Burquitlam"))).toBe(true);
    expect(tickets.some((t) => t.text.includes("condo"))).toBe(true);
    expect(tickets.some((t) => t.text.includes("012-345-678"))).toBe(true);
    expect(tickets.every((t) => t.source === "viewing_brief")).toBe(true);
    expect(tickets.every((t) => t.priority === "high" || t.priority === "medium" || t.priority === "low")).toBe(
      true,
    );
  });

  it("preserves answers when re-seeding", () => {
    const first = buildViewingBriefTickets({
      address: "1 Main St",
      market: "OTHER",
    });
    const answered = first.map((ticket, index) =>
      index === 0 ? { ...ticket, checked: true, answer: "Looks solid" } : ticket,
    );
    const next = ensureViewingBriefQuestions(answered, {
      address: "1 Main St",
      market: "OTHER",
    });
    expect(next[0]).toMatchObject({ checked: true, answer: "Looks solid" });
    expect(next.length).toBeGreaterThanOrEqual(first.length);
  });

  it("resolves ticket statuses including needs_more", () => {
    expect(resolveTicketStatus({ id: 1, text: "A", checked: false })).toBe("to_confirm");
    expect(
      resolveTicketStatus({ id: 1, text: "A", checked: true, answer: "Detailed enough answer" }),
    ).toBe("answered");
    expect(resolveTicketStatus({ id: 1, text: "A", checked: true, answer: "ok" })).toBe(
      "needs_more",
    );
  });

  it("counts high-priority open tickets and skips ignored discoveries", () => {
    expect(
      countHighPriorityOpenTickets([
        { id: 1, text: "A", checked: false, priority: "high" },
        { id: 2, text: "B", checked: true, answer: "Detailed enough answer here", priority: "high" },
        { id: 3, text: "C", checked: false, priority: "medium" },
        {
          id: 4,
          text: "D",
          checked: false,
          priority: "high",
          source: "ai_discovery",
          discoveryStatus: "ignored",
        },
      ]),
    ).toBe(1);
  });

  it("partitions by category order", () => {
    const tickets = buildViewingBriefTickets({
      address: "Somewhere",
      market: "CA",
    });
    const parts = partitionByCategory(tickets);
    expect(parts[0]?.category).toBe("condition");
    expect(parts.map((p) => p.category)).toContain("costs_docs");
  });
});
