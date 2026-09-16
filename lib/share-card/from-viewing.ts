import type { ViewingAiSummary } from "@/lib/ai-summary";
import {
  buildDecisionSummary,
  type DecisionSummarySnapshot,
} from "@/lib/share-card";

function activeClaims(
  items: ViewingAiSummary["facts"] | undefined,
): Array<{ id: string; text: string }> {
  return (items ?? [])
    .filter((item) => !item.deleted && item.text.trim())
    .map((item) => ({ id: item.id, text: item.text.trim() }));
}

export type BuildCardFromViewingInput = {
  address: string;
  viewingAt: string;
  unitLabel: string;
  priceLabel: string;
  layoutLabel: string;
  areaLabel?: string;
  managementFeeLabel?: string;
  listingUrl: string;
  setupNotes: string;
  overallRating?: number | null;
  pros: string[];
  risks: string[];
  aiSummary: ViewingAiSummary | null;
  pendingQuestions?: Array<{ text: string; checked?: boolean; answer?: string }>;
  photos: Array<{
    id: string | number;
    url?: string;
    thumbUrl?: string;
    remotePath?: string | null;
    tag?: string;
    note?: string;
  }>;
  disclaimer: string;
  previous?: DecisionSummarySnapshot | null;
};

/** Build editable card draft. Preserves prior selections when ids match. */
export function buildCardFromViewing(
  input: BuildCardFromViewingInput,
): DecisionSummarySnapshot {
  const fromAi = input.aiSummary;
  const aiPros = activeClaims(fromAi?.pros);
  const aiRisks = activeClaims(fromAi?.risks);
  const pros =
    fromAi && aiPros.length > 0
      ? aiPros
      : input.pros.map((text) => ({ text }));
  // When an AI summary exists, deleted risks stay excluded (no legacy fallback).
  const risks = fromAi
    ? aiRisks
    : input.risks.map((text) => ({ text }));
  const facts = activeClaims(fromAi?.facts);
  const followUpsFromAi = activeClaims(fromAi?.followUps);
  const followUps =
    followUpsFromAi.length > 0
      ? followUpsFromAi
      : (input.pendingQuestions ?? [])
          .filter((q) => !q.checked || !q.answer)
          .map((q) => ({ text: q.text }));
  const actionItems = activeClaims(fromAi?.actionItems);

  const fresh = buildDecisionSummary({
    address: input.address,
    viewingAt: input.viewingAt,
    unitLabel: input.unitLabel,
    priceLabel: input.priceLabel,
    layoutLabel: input.layoutLabel,
    areaLabel: input.areaLabel,
    managementFeeLabel: input.managementFeeLabel,
    listingUrl: input.listingUrl,
    setupNotes: input.setupNotes,
    overallRating:
      input.overallRating ??
      input.previous?.overallRating ??
      null,
    pros,
    risks,
    facts,
    followUps,
    actionItems,
    photos: input.photos,
    disclaimer: input.disclaimer,
  });

  if (!input.previous) return fresh;

  const prev = input.previous;
  const mergeSelected = <T extends { id: string; text?: string; selected: boolean }>(
    nextItems: T[],
    prevItems: T[],
    matchByText = false,
  ): T[] =>
    nextItems.map((item, index) => {
      const byId = prevItems.find((p) => p.id === item.id);
      if (byId) return { ...item, selected: byId.selected };
      if (matchByText && item.text) {
        const byText = prevItems.find((p) => p.text === item.text);
        if (byText) return { ...item, selected: byText.selected };
      }
      return { ...item, selected: item.selected ?? index < 3 };
    });

  return {
    ...fresh,
    overallRating: prev.overallRating ?? fresh.overallRating,
    pros: mergeSelected(fresh.pros, prev.pros, true),
    risks: mergeSelected(fresh.risks, prev.risks, true),
    facts: mergeSelected(fresh.facts, prev.facts, true),
    followUps: mergeSelected(fresh.followUps, prev.followUps, true),
    actionItems: mergeSelected(fresh.actionItems, prev.actionItems, true),
    photos: mergeSelected(fresh.photos, prev.photos),
  };
}
