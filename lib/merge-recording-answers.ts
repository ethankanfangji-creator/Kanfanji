export type RecordingAnswer = {
  id: number;
  status: "answered" | "pending";
  answer: string;
};

export type MergeableQuestion = {
  id: number;
  text: string;
  checked: boolean;
  answer?: string;
  isFollowUp?: boolean;
  basedOn?: string;
  isDynamic?: boolean;
  source?: string;
  analysisStatus?: "analyzing" | "failed";
  answerPreview?: {
    noteSummary?: string;
    aiSummary?: string;
    mediaThumbs?: string[];
  };
};

export type GeneratedFollowUp = {
  text: string;
  status: "answered" | "pending";
  answer: string;
  reason?: string;
  based_on?: string;
};

/**
 * Merge one recording's AI answers into the existing question list.
 * Pending or blank hits must not wipe answers from an earlier clip or the user.
 */
export function mergeRecordingAnswers<T extends MergeableQuestion>(
  current: T[],
  answers: RecordingAnswer[] | undefined,
  generated: GeneratedFollowUp[] | undefined,
): T[] {
  const updated = current.map((question) => {
    const hit = answers?.find((item) => item.id === question.id);
    if (!hit || hit.status !== "answered") return question;
    const nextAnswer = hit.answer?.trim();
    if (!nextAnswer) return question;
    return {
      ...question,
      checked: true,
      answer: nextAnswer,
      analysisStatus: undefined,
      answerPreview: {
        ...question.answerPreview,
        noteSummary: nextAnswer,
      },
    };
  });

  const existingTexts = new Set(updated.map((question) => question.text.trim().toLowerCase()));
  let nextId = updated.reduce((max, question) => Math.max(max, question.id), 0) + 1;
  const extras: T[] = [];
  for (const item of generated ?? []) {
    const text = item.text.trim();
    if (!text || existingTexts.has(text.toLowerCase())) continue;
    existingTexts.add(text.toLowerCase());
    extras.push({
      id: nextId,
      text,
      checked: item.status === "answered",
      answer: item.answer || (item.status === "answered" ? "" : "待確認"),
      isFollowUp: true,
      basedOn: item.based_on || item.reason || "",
      isDynamic: true,
      source: "audio",
    } as T);
    nextId += 1;
  }

  return [...updated, ...extras];
}
