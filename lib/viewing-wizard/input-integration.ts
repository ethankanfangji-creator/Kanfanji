/**
 * Composer input → viewing integration (merge, never overwrite blindly).
 */

import type { ViewingAiSummary } from "@/lib/ai-summary";
import type { WizardQuestion } from "./questions";
import type { ViewingBriefCategory, ViewingBriefPriority } from "./viewing-brief";
import { VIEWING_BRIEF_CATEGORIES } from "./viewing-brief";

export const AI_DISCOVERY_ID_BASE = 720_000;

export type ComposerAttachmentKind = "image" | "audio";

export type ViewingInputEntry = {
  id: string;
  viewingSessionId: string;
  createdAt: string;
  kind: "text" | "transcript" | "image" | "mixed";
  /** Raw user payload kept for audit / regen. */
  original: {
    text?: string;
    transcript?: string;
    mediaId?: string;
    mimeType?: string;
    fileName?: string;
  };
  boundQuestionId?: number | null;
  /** AI merge snapshot (null if AI skipped / failed). */
  integration?: ViewingInputIntegrationResult | null;
  error?: string | null;
};

export type ViewingInputIntegrationResult = {
  integratedAt: string;
  boundQuestionUpdates: Array<{
    questionId: number;
    answerPatch: string;
    status: "answered" | "needs_more";
    evidence?: string;
    source: "user_input" | "ai_inferred";
  }>;
  discoveryTickets: Array<{
    title: string;
    category: ViewingBriefCategory;
    priority: ViewingBriefPriority;
    description?: string;
    sourceLabel: "ai_inferred";
  }>;
  summaryPatches?: {
    risks?: string[];
    followUps?: string[];
    actionItems?: string[];
  };
  imageUncertain?: boolean;
  message?: string;
};

export function createInputEntryId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `in_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function mergeAnswerText(existing: string | undefined, patch: string): string {
  const prior = existing?.trim() ?? "";
  const next = patch.trim();
  if (!next) return prior;
  if (!prior) return next;
  if (prior.includes(next)) return prior;
  return `${prior}\n—\n${next}`;
}

export function applyIntegrationToQuestions(
  questions: WizardQuestion[],
  result: ViewingInputIntegrationResult,
  options?: { entryId?: string },
): WizardQuestion[] {
  let next = questions.map((question) => {
    const update = result.boundQuestionUpdates.find((item) => item.questionId === question.id);
    if (!update) return question;
    const mergedAnswer = mergeAnswerText(question.answer, update.answerPatch);
    return {
      ...question,
      answer: mergedAnswer,
      checked: Boolean(mergedAnswer),
      analysisStatus: update.status === "needs_more" ? ("failed" as const) : undefined,
      answerPreview: {
        ...question.answerPreview,
        noteSummary: mergedAnswer.slice(0, 180),
        aiSummary:
          update.source === "ai_inferred"
            ? update.evidence || update.answerPatch.slice(0, 180)
            : question.answerPreview?.aiSummary,
      },
      hint:
        update.source === "user_input"
          ? "來源：使用者輸入"
          : "來源：AI 推測／待確認",
    };
  });

  const existingTexts = new Set(next.map((q) => q.text.trim().toLowerCase()));
  let idCursor = next.reduce((max, q) => Math.max(max, q.id), AI_DISCOVERY_ID_BASE);
  for (const ticket of result.discoveryTickets) {
    const key = ticket.title.trim().toLowerCase();
    if (!key || existingTexts.has(key)) continue;
    existingTexts.add(key);
    idCursor += 1;
    next = [
      ...next,
      {
        id: idCursor,
        text: ticket.title.trim(),
        checked: false,
        isDynamic: true,
        isFollowUp: true,
        source: "ai_discovery",
        basedOn: `discovery:${options?.entryId ?? idCursor}`,
        category: ticket.category,
        priority: ticket.priority,
        description: ticket.description,
        discoveryStatus: "pending",
        hint: "AI 新發現",
      },
    ];
  }

  return next;
}

export function setDiscoveryStatus(
  questions: WizardQuestion[],
  questionId: number,
  status: "confirmed" | "ignored",
): WizardQuestion[] {
  return questions.map((question) => {
    if (question.id !== questionId) return question;
    if (status === "ignored") {
      return {
        ...question,
        discoveryStatus: "ignored",
        checked: false,
        hint: "已忽略的 AI 新發現",
      };
    }
    return {
      ...question,
      discoveryStatus: "confirmed",
      hint: "已確認的 AI 新發現",
    };
  });
}

export function appendInputLog(
  log: ViewingInputEntry[] | undefined,
  entry: ViewingInputEntry,
  max = 40,
): ViewingInputEntry[] {
  return [...(log ?? []), entry].slice(-max);
}

export function normalizeIntegrationPayload(
  raw: unknown,
  boundQuestionId: number | null,
): ViewingInputIntegrationResult {
  const now = new Date().toISOString();
  const empty: ViewingInputIntegrationResult = {
    integratedAt: now,
    boundQuestionUpdates: [],
    discoveryTickets: [],
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty;
  const obj = raw as Record<string, unknown>;

  if (obj.imageUncertain === true) {
    return {
      ...empty,
      imageUncertain: true,
      message:
        typeof obj.message === "string" && obj.message.trim()
          ? obj.message.trim().slice(0, 400)
          : "無法確認圖片內容，請改用文字描述或換一張更清楚的照片。",
      boundQuestionUpdates:
        boundQuestionId != null
          ? [
              {
                questionId: boundQuestionId,
                answerPatch: "無法確認（圖片內容不足）",
                status: "needs_more",
                source: "ai_inferred",
              },
            ]
          : [],
    };
  }

  const updatesRaw = Array.isArray(obj.boundQuestionUpdates) ? obj.boundQuestionUpdates : [];
  const boundQuestionUpdates: ViewingInputIntegrationResult["boundQuestionUpdates"] = [];
  for (const item of updatesRaw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const questionId = Number(row.questionId);
    const answerPatch = typeof row.answerPatch === "string" ? row.answerPatch.trim() : "";
    if (!Number.isSafeInteger(questionId) || !answerPatch) continue;
    boundQuestionUpdates.push({
      questionId,
      answerPatch: answerPatch.slice(0, 800),
      status: row.status === "needs_more" ? "needs_more" : "answered",
      evidence: typeof row.evidence === "string" ? row.evidence.trim().slice(0, 400) : undefined,
      source: row.source === "ai_inferred" ? "ai_inferred" : "user_input",
    });
  }

  // If model forgot bound ticket but we have one and free text, keep a user_input patch.
  if (
    boundQuestionId != null &&
    boundQuestionUpdates.every((item) => item.questionId !== boundQuestionId) &&
    typeof obj.fallbackAnswer === "string" &&
    obj.fallbackAnswer.trim()
  ) {
    boundQuestionUpdates.push({
      questionId: boundQuestionId,
      answerPatch: obj.fallbackAnswer.trim().slice(0, 800),
      status: "answered",
      source: "user_input",
    });
  }

  const discoveryRaw = Array.isArray(obj.discoveryTickets) ? obj.discoveryTickets : [];
  const discoveryTickets: ViewingInputIntegrationResult["discoveryTickets"] = [];
  for (const item of discoveryRaw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const category = String(row.category);
    const priority = row.priority;
    if (!title || title.length < 8) continue;
    if (!(VIEWING_BRIEF_CATEGORIES as readonly string[]).includes(category)) continue;
    if (priority !== "high" && priority !== "medium" && priority !== "low") continue;
    discoveryTickets.push({
      title: title.slice(0, 220),
      category: category as ViewingBriefCategory,
      priority,
      description:
        typeof row.description === "string" ? row.description.trim().slice(0, 240) : undefined,
      sourceLabel: "ai_inferred",
    });
    if (discoveryTickets.length >= 5) break;
  }

  const summary = obj.summaryPatches;
  let summaryPatches: ViewingInputIntegrationResult["summaryPatches"];
  if (summary && typeof summary === "object" && !Array.isArray(summary)) {
    const s = summary as Record<string, unknown>;
    summaryPatches = {
      risks: Array.isArray(s.risks)
        ? s.risks.filter((x): x is string => typeof x === "string").slice(0, 5)
        : undefined,
      followUps: Array.isArray(s.followUps)
        ? s.followUps.filter((x): x is string => typeof x === "string").slice(0, 5)
        : undefined,
      actionItems: Array.isArray(s.actionItems)
        ? s.actionItems.filter((x): x is string => typeof x === "string").slice(0, 5)
        : undefined,
    };
  }

  return {
    integratedAt: now,
    boundQuestionUpdates,
    discoveryTickets,
    summaryPatches,
    message: typeof obj.message === "string" ? obj.message.trim().slice(0, 400) : undefined,
  };
}

/** Soft-append risk strings into legacy pros/risks arrays without wiping. */
export function mergeLegacyRiskLines(existing: string[], incoming: string[] | undefined): string[] {
  if (!incoming?.length) return existing;
  const seen = new Set(existing.map((line) => line.trim().toLowerCase()));
  const next = [...existing];
  for (const line of incoming) {
    const key = line.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(line.trim());
    if (next.length >= 8) break;
  }
  return next;
}

export function isOffTopicAddressRequest(text: string): boolean {
  return /(?:另一|别的|other\s+address|new\s+address|換地址|换地址|不是這|不是这)/i.test(text);
}

export type { ViewingAiSummary };
