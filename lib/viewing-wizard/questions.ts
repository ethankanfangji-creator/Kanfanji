import type { FieldChecklistItem } from "@/lib/field-capture";
import { FIELD_CHECKLIST_IDS } from "@/lib/field-capture/checklist";

/** Stable numeric id range reserved for checklist-backed questions. */
export const CHECKLIST_QUESTION_ID_BASE = 800_000;

export type QuestionAnswerStatus =
  | "unanswered"
  | "processing"
  | "answered"
  | "analyzing"
  | "analysis_failed";

export type QuestionAnswerPreview = {
  noteSummary?: string;
  aiSummary?: string;
  mediaThumbs?: string[];
};

export type WizardQuestion = {
  id: number;
  text: string;
  checked: boolean;
  answer?: string;
  isFollowUp?: boolean;
  basedOn?: string;
  isDynamic?: boolean;
  source?: "photo" | "audio" | "opendata" | "checklist" | "viewing_brief" | "address" | string;
  aiJobId?: string;
  /** Optional longer description shown under the title. */
  description?: string;
  /** Optional short hint (tag / dialogue / checklist context). */
  hint?: string;
  /** Explicit analysis lifecycle; overrides derived answered/unanswered when set. */
  analysisStatus?: "analyzing" | "failed";
  /** Display-only answer artifacts for answered cards. */
  answerPreview?: QuestionAnswerPreview;
  /** Structured viewing-brief category for Step 2 tickets. */
  category?: "condition" | "transit" | "amenities" | "costs_docs" | "onsite_confirm" | string;
  /** Ticket priority for on-site triage. */
  priority?: "high" | "medium" | "low";
  /** AI discovery lifecycle — only for source=ai_discovery. */
  discoveryStatus?: "pending" | "confirmed" | "ignored";
};

export function isChecklistQuestion(question: WizardQuestion): boolean {
  return question.source === "checklist";
}

export function checklistPresetId(question: WizardQuestion): string | null {
  if (!isChecklistQuestion(question) || !question.basedOn?.startsWith("preset:")) return null;
  return question.basedOn.slice("preset:".length);
}

export function createDefaultFieldQuestions(
  labels: Record<string, string>,
): WizardQuestion[] {
  return FIELD_CHECKLIST_IDS.map((key, index) => ({
    id: CHECKLIST_QUESTION_ID_BASE + index,
    text: labels[key] ?? key,
    checked: false,
    isDynamic: true,
    source: "checklist" as const,
    basedOn: `preset:${key}`,
  }));
}

/**
 * Ensure the 10 default field questions exist. Question status is the checklist
 * status — no separate checklist UI for users to maintain.
 */
export function ensureDefaultFieldQuestions(
  questions: WizardQuestion[],
  labels: Record<string, string>,
): WizardQuestion[] {
  const defaults = createDefaultFieldQuestions(labels);
  const defaultKeys = new Set(FIELD_CHECKLIST_IDS.map((key) => `preset:${key}`));
  const existingByKey = new Map(
    questions
      .filter((question) => isChecklistQuestion(question) && question.basedOn)
      .map((question) => [question.basedOn!, question] as const),
  );

  const ensured = defaults.map((defaultQuestion) => {
    const existing = existingByKey.get(defaultQuestion.basedOn!);
    if (!existing) return defaultQuestion;
    return {
      ...defaultQuestion,
      checked: existing.checked,
      answer: existing.answer,
      analysisStatus: existing.analysisStatus,
      answerPreview: existing.answerPreview,
      aiJobId: existing.aiJobId,
      hint: existing.hint,
      description: existing.description,
    };
  });

  const extras = questions.filter(
    (question) => !isChecklistQuestion(question) || !defaultKeys.has(question.basedOn ?? ""),
  );
  return [...ensured, ...extras];
}

/** Derive legacy fieldChecklist rows from question state for IDB compatibility. */
export function deriveFieldChecklistFromQuestions(
  questions: WizardQuestion[],
  labels: Record<string, string>,
): FieldChecklistItem[] {
  const briefChecklistMap: Record<string, string> = {
    wall_crack: "brief:condition_structure",
    water_leak: "brief:condition_leak",
    light_air: "brief:condition_light_air",
    noise: "brief:condition_noise",
    electrical_panel: "brief:condition_systems",
    amenities: "brief:amenity_grocery",
    parking: "brief:onsite_parking",
    window_fog: "brief:onsite_windows",
    plumbing: "brief:onsite_plumbing",
    water_heater: "brief:condition_systems",
  };

  return FIELD_CHECKLIST_IDS.map((key, index) => {
    const basedOn = `preset:${key}`;
    const briefBasedOn = briefChecklistMap[key];
    const question = questions.find(
      (item) =>
        (isChecklistQuestion(item) && item.basedOn === basedOn) ||
        (briefBasedOn != null && item.basedOn === briefBasedOn),
    );
    return {
      id: basedOn,
      key,
      text: labels[key] ?? key,
      checked: question ? isQuestionAnswered(question) : false,
      note: question?.answer?.trim() ?? "",
      custom: false,
      sortOrder: index,
    };
  });
}

export function isQuestionAnswered(question: WizardQuestion): boolean {
  return Boolean(question.answer?.trim()) || question.checked;
}

export function resolveQuestionStatus(
  question: WizardQuestion,
  options?: { activeId?: number | null },
): QuestionAnswerStatus {
  if (question.analysisStatus === "analyzing") return "analyzing";
  if (question.analysisStatus === "failed") return "analysis_failed";
  if (options?.activeId === question.id) return "processing";
  if (isQuestionAnswered(question)) return "answered";
  return "unanswered";
}

export function getQuestionProgress(questions: WizardQuestion[]): {
  completed: number;
  total: number;
  ratio: number;
} {
  const visible = questions.filter((q) => q.discoveryStatus !== "ignored");
  const total = visible.length;
  const completed = visible.filter(isQuestionAnswered).length;
  return {
    completed,
    total,
    ratio: total === 0 ? 0 : completed / total,
  };
}

export function partitionByAnswered(questions: WizardQuestion[]): {
  unanswered: WizardQuestion[];
  answered: WizardQuestion[];
} {
  const unanswered: WizardQuestion[] = [];
  const answered: WizardQuestion[] = [];
  for (const question of questions) {
    if (isQuestionAnswered(question)) answered.push(question);
    else unanswered.push(question);
  }
  return { unanswered, answered };
}

export function buildQuestionHint(
  question: WizardQuestion,
  labels: { tagLabel: string; byDialogue: string; checklistHint: string },
): string | undefined {
  if (question.hint?.trim()) return question.hint.trim();
  if (question.description?.trim()) return question.description.trim();
  if (question.source === "photo" && question.basedOn) {
    return `${labels.tagLabel}${question.basedOn}`;
  }
  if (question.isFollowUp && question.basedOn) {
    return `${labels.byDialogue}${question.basedOn}`;
  }
  if (isChecklistQuestion(question)) return labels.checklistHint;
  return undefined;
}

/**
 * Attach display hints and answer previews without inventing analysis backends.
 * Uses existing note matches / photo thumbs when available.
 */
export function presentWizardQuestions(
  questions: WizardQuestion[],
  context: {
    notes: Array<{ transcript: string; matched: number[] }>;
    photos: Array<{ tag: string; tagId?: string; thumbUrl?: string; url?: string }>;
    labels: { tagLabel: string; byDialogue: string; checklistHint: string };
  },
): WizardQuestion[] {
  return questions.map((question) => {
    const matchedNote = context.notes.find((note) => note.matched.includes(question.id));
    const noteSummary =
      question.answerPreview?.noteSummary ||
      question.answer?.trim() ||
      (matchedNote?.transcript ? matchedNote.transcript.trim().slice(0, 140) : undefined);
    const mediaThumbs =
      question.answerPreview?.mediaThumbs ||
      (question.source === "photo" && question.basedOn
        ? context.photos
            .filter(
              (photo) =>
                photo.tag === question.basedOn ||
                photo.tagId === question.basedOn ||
                photo.tag.includes(String(question.basedOn)),
            )
            .map((photo) => photo.thumbUrl || photo.url)
            .filter((url): url is string => Boolean(url))
            .slice(0, 3)
        : undefined);
    const aiSummary =
      question.answerPreview?.aiSummary ||
      (question.isFollowUp && question.answer?.trim() ? question.answer.trim() : undefined);

    return {
      ...question,
      hint: buildQuestionHint(question, context.labels),
      answerPreview:
        noteSummary || aiSummary || (mediaThumbs && mediaThumbs.length > 0)
          ? {
              noteSummary,
              aiSummary,
              mediaThumbs,
            }
          : question.answerPreview,
    };
  });
}

/**
 * Fold field-checklist items into the intelligent question list.
 * Does not delete checklist rows — only mirrors them as answerable questions.
 */
export function mergeChecklistIntoQuestions(
  questions: WizardQuestion[],
  checklist: FieldChecklistItem[],
): WizardQuestion[] {
  const byChecklistId = new Set(
    questions
      .filter(isChecklistQuestion)
      .map((question) => question.basedOn)
      .filter((value): value is string => Boolean(value)),
  );
  const byText = new Set(questions.map((question) => question.text.trim().toLowerCase()));

  const extras: WizardQuestion[] = [];
  checklist.forEach((item, index) => {
    if (byChecklistId.has(item.id)) return;
    const normalized = item.text.trim().toLowerCase();
    if (!normalized || byText.has(normalized)) return;
    extras.push({
      id: CHECKLIST_QUESTION_ID_BASE + index,
      text: item.text,
      checked: item.checked,
      answer: item.note.trim() ? item.note : undefined,
      isDynamic: true,
      source: "checklist",
      basedOn: item.id,
    });
    byText.add(normalized);
  });

  return extras.length ? [...questions, ...extras] : questions;
}

/** Keep legacy fieldChecklist rows in sync when checklist-backed questions change. */
export function syncQuestionAnswerToChecklist(
  checklist: FieldChecklistItem[],
  question: WizardQuestion,
): FieldChecklistItem[] {
  if (!isChecklistQuestion(question) || !question.basedOn) return checklist;
  let changed = false;
  const next = checklist.map((item) => {
    if (item.id !== question.basedOn) return item;
    const note = question.answer?.trim() ?? "";
    if (item.checked === question.checked && item.note === note) return item;
    changed = true;
    return { ...item, checked: question.checked, note };
  });
  return changed ? next : checklist;
}

export function partitionQuestions(questions: WizardQuestion[]) {
  const photo = questions.filter((q) => q.isDynamic && q.source === "photo");
  const followUp = questions.filter((q) => q.isFollowUp);
  const checklist = questions.filter(isChecklistQuestion);
  const bank = questions.filter(
    (q) =>
      !q.isFollowUp &&
      !(q.isDynamic && q.source === "photo") &&
      !isChecklistQuestion(q),
  );
  return { photo, bank, followUp, checklist };
}
