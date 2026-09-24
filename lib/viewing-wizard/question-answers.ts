import type { QuestionAnswerPreview, WizardQuestion } from "@/lib/viewing-wizard/questions";

/**
 * Apply a typed / transcribed answer onto one question card.
 * Checklist derivation and persistence stay in the caller.
 */
export function applyAnswerToQuestions<T extends WizardQuestion>(
  questions: T[],
  questionId: number,
  answer: string,
  preview?: QuestionAnswerPreview,
): T[] {
  return questions.map((item) =>
    item.id === questionId
      ? ({
          ...item,
          answer: answer || undefined,
          checked: Boolean(answer),
          analysisStatus: undefined,
          answerPreview: preview
            ? {
                ...item.answerPreview,
                ...preview,
                noteSummary: preview.noteSummary ?? answer,
              }
            : {
                ...item.answerPreview,
                noteSummary: answer || item.answerPreview?.noteSummary,
              },
        } as T)
      : item,
  );
}

/** Mark a ticket as analyzing while Whisper / AI runs. */
export function markQuestionAnalyzing<T extends WizardQuestion>(
  questions: T[],
  pendingId: number | null,
): T[] {
  if (pendingId == null) return questions;
  return questions.map((item) =>
    item.id === pendingId ? ({ ...item, analysisStatus: "analyzing" as const } as T) : item,
  );
}

/**
 * After mergeRecordingAnswers: clear analyzing on the pending card.
 * If still unanswered, fill a capture fallback summary.
 */
export function resolvePendingAnalyzingQuestion<T extends WizardQuestion>(
  question: T,
  pendingId: number | null,
  fallbackAnswer: string,
): T {
  if (pendingId == null || question.id !== pendingId) return question;
  if (question.analysisStatus !== "analyzing") return question;
  if (!question.checked && !question.answer?.trim()) {
    return {
      ...question,
      checked: true,
      answer: fallbackAnswer,
      analysisStatus: undefined,
      answerPreview: {
        ...question.answerPreview,
        noteSummary: fallbackAnswer,
      },
    };
  }
  return { ...question, analysisStatus: undefined };
}

/** Clear stuck analyzing flags (e.g. processRecording finally). */
export function clearAnalyzingStatus<T extends WizardQuestion>(
  questions: T[],
  pendingId: number | null,
): T[] {
  if (pendingId == null) return questions;
  return questions.map((item) =>
    item.id === pendingId && item.analysisStatus === "analyzing"
      ? ({ ...item, analysisStatus: undefined } as T)
      : item,
  );
}

export function activeQuestionBankOrDefault<T extends WizardQuestion>(
  questions: T[],
  defaults: T[],
): T[] {
  return questions.length > 0 ? questions : defaults;
}

/** Mic / import busy while recording or processing, or another capture lock held. */
export function isAudioCaptureBusy(
  audioState: string,
  captureLock: string | null,
): boolean {
  return audioState === "recording" || audioState === "processing" || captureLock != null;
}
