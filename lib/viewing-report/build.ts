import type { ViewingAiSummary } from "@/lib/ai-summary";
import type { PropertyBasicsSnapshot } from "@/lib/property-basics/types";
import type { ViewingInputEntry } from "@/lib/viewing-wizard/input-integration";
import type { WizardQuestion } from "@/lib/viewing-wizard/questions";
import {
  resolveTicketStatus,
  VIEWING_BRIEF_CATEGORIES,
  type ViewingBriefCategory,
} from "@/lib/viewing-wizard/viewing-brief";
import type {
  ViewingReport,
  ViewingReportCategory,
  ViewingReportCategorySummary,
  ViewingReportObservation,
  ViewingReportTicketItem,
} from "./types";

export type BuildViewingReportInput = {
  address: string;
  viewingAt: string;
  unitLabel: string;
  priceLabel: string;
  layoutLabel: string;
  areaLabel: string;
  managementFeeLabel: string;
  listingUrl: string;
  setupNotes: string;
  market: "CA" | "US" | "TW" | "TH" | "OTHER";
  tags: string[];
  localSessionId: string | null;
  propertyBasics: PropertyBasicsSnapshot | null;
  questions: WizardQuestion[];
  notes: Array<{
    id: number;
    transcript: string;
    kind?: "text" | "transcript";
  }>;
  photos: Array<{
    id: string | number;
    url?: string;
    thumbUrl?: string;
    tag?: string;
    note?: string;
  }>;
  pros: string[];
  risks: string[];
  aiSummary: ViewingAiSummary | null;
  inputLog?: ViewingInputEntry[];
  preserveOriginalsNote: string;
  generatedAt?: string;
};

function asCategory(raw: string | undefined): ViewingReportCategory {
  if (raw && (VIEWING_BRIEF_CATEGORIES as readonly string[]).includes(raw)) {
    return raw as ViewingBriefCategory;
  }
  return "other";
}

function activeClaimTexts(
  items: ViewingAiSummary["facts"] | undefined,
): string[] {
  return (items ?? [])
    .filter((item) => !item.deleted && item.text.trim())
    .map((item) => item.text.trim())
    .slice(0, 12);
}

function toTicketItem(question: WizardQuestion): ViewingReportTicketItem {
  const ticketStatus = resolveTicketStatus(question);
  return {
    id: question.id,
    text: question.text,
    answer: question.answer?.trim() || undefined,
    category: asCategory(question.category),
    priority: question.priority,
    status:
      ticketStatus === "answered"
        ? "answered"
        : ticketStatus === "needs_more"
          ? "needs_more"
          : "unanswered",
    discoveryStatus: question.discoveryStatus,
    hint: question.hint,
  };
}

function buildCategorySummaries(
  questions: WizardQuestion[],
): ViewingReportCategorySummary[] {
  const visible = questions.filter((q) => q.discoveryStatus !== "ignored");
  const order: ViewingReportCategory[] = [
    ...VIEWING_BRIEF_CATEGORIES,
    "other",
  ];
  return order
    .map((category) => {
      const items = visible.filter((q) => asCategory(q.category) === category);
      if (!items.length) return null;
      const answered = items.filter((q) => resolveTicketStatus(q) === "answered");
      const open = items.filter((q) => resolveTicketStatus(q) !== "answered");
      const highlights = answered
        .map((q) => {
          const answer = q.answer?.trim();
          if (!answer) return null;
          return `${q.text.slice(0, 60)}${q.text.length > 60 ? "…" : ""}：${answer.slice(0, 120)}`;
        })
        .filter((line): line is string => Boolean(line))
        .slice(0, 4);
      return {
        category,
        answeredCount: answered.length,
        openCount: open.length,
        highlights,
      };
    })
    .filter((row): row is ViewingReportCategorySummary => row != null);
}

function buildObservations(
  inputLog: ViewingInputEntry[] | undefined,
): ViewingReportObservation[] {
  return (inputLog ?? [])
    .slice(-20)
    .map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      text: entry.original.text,
      transcript: entry.original.transcript,
      createdAt: entry.createdAt,
      boundQuestionId: entry.boundQuestionId,
      aiNote:
        entry.integration?.message ||
        entry.integration?.boundQuestionUpdates
          ?.map((u) => u.answerPatch)
          .filter(Boolean)
          .join(" · ") ||
        entry.error ||
        null,
    }))
    .reverse();
}

export function buildViewingReport(input: BuildViewingReportInput): ViewingReport {
  const visible = input.questions.filter((q) => q.discoveryStatus !== "ignored");
  const answered: ViewingReportTicketItem[] = [];
  const unanswered: ViewingReportTicketItem[] = [];
  const discoveries: ViewingReportTicketItem[] = [];

  for (const question of visible) {
    const item = toTicketItem(question);
    if (question.source === "ai_discovery") {
      discoveries.push(item);
      continue;
    }
    if (item.status === "answered") answered.push(item);
    else unanswered.push(item);
  }

  const toConfirm = [
    ...unanswered
      .filter((t) => t.priority === "high" || t.category === "onsite_confirm")
      .map((t) => t.text),
    ...discoveries
      .filter((t) => t.discoveryStatus === "pending" || !t.discoveryStatus)
      .map((t) => t.text),
  ].slice(0, 20);

  const aiRisks = activeClaimTexts(input.aiSummary?.risks);
  const legacyRisks = input.risks.map((line) => line.trim()).filter(Boolean);
  const risks = (aiRisks.length ? aiRisks : legacyRisks).slice(0, 12);
  const aiPros = activeClaimTexts(input.aiSummary?.pros);
  const aiFacts = activeClaimTexts(input.aiSummary?.facts);
  const aiFollowUps = activeClaimTexts(input.aiSummary?.followUps);
  const aiActions = activeClaimTexts(input.aiSummary?.actionItems);

  const basics = input.propertyBasics;

  return {
    version: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    property: {
      address: input.address.trim(),
      unitLabel: input.unitLabel.trim(),
      priceLabel: input.priceLabel.trim(),
      layoutLabel: input.layoutLabel.trim(),
      areaLabel: input.areaLabel.trim(),
      managementFeeLabel: input.managementFeeLabel.trim(),
      listingUrl: input.listingUrl.trim(),
      setupNotes: input.setupNotes.trim(),
      propertyType: basics?.propertyType?.value ?? null,
      yearBuilt: basics?.yearBuilt?.value ?? null,
      basicsSummary: basics?.summary?.value ?? null,
      sources: basics?.sources ?? [],
    },
    viewing: {
      viewingAt: input.viewingAt,
      market: input.market,
      tags: input.tags.slice(0, 20),
      localSessionId: input.localSessionId,
    },
    categorySummaries: buildCategorySummaries(input.questions),
    observations: buildObservations(input.inputLog),
    originalNotes: input.notes
      .filter((note) => note.transcript.trim())
      .map((note) => ({
        id: note.id,
        kind: note.kind === "text" ? ("text" as const) : ("transcript" as const),
        text: note.transcript.trim(),
      }))
      .slice(-30),
    photos: input.photos
      .map((photo) => ({
        id: String(photo.id),
        url: photo.thumbUrl || photo.url || "",
        tag: photo.tag?.trim() || "",
        note: photo.note?.trim() || "",
      }))
      .filter((photo) => photo.url)
      .slice(0, 24),
    tickets: { answered, unanswered, discoveries },
    risks,
    toConfirm,
    aiIntegration: {
      facts: aiFacts,
      pros:
        aiPros.length > 0
          ? aiPros
          : input.pros.map((p) => p.trim()).filter(Boolean).slice(0, 12),
      risks,
      followUps: aiFollowUps.length > 0 ? aiFollowUps : unanswered.map((t) => t.text).slice(0, 12),
      actionItems: aiActions.length > 0 ? aiActions : toConfirm.slice(0, 12),
      preserveOriginalsNote: input.preserveOriginalsNote,
    },
  };
}
