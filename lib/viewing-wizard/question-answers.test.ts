import { describe, expect, it } from "vitest";
import {
  activeQuestionBankOrDefault,
  applyAnswerToQuestions,
  clearAnalyzingStatus,
  isAudioCaptureBusy,
  markQuestionAnalyzing,
  resolvePendingAnalyzingQuestion,
} from "./question-answers";
import type { WizardQuestion } from "./questions";

function q(id: number, extras: Partial<WizardQuestion> = {}): WizardQuestion {
  return { id, text: `Q${id}`, checked: false, ...extras };
}

describe("applyAnswerToQuestions", () => {
  it("sets answer, checked, and clears analysisStatus", () => {
    const next = applyAnswerToQuestions(
      [q(1, { analysisStatus: "analyzing" }), q(2)],
      1,
      "漏水已修",
    );
    expect(next[0]).toMatchObject({
      answer: "漏水已修",
      checked: true,
      analysisStatus: undefined,
      answerPreview: { noteSummary: "漏水已修" },
    });
    expect(next[1]).toEqual(q(2));
  });

  it("clears answer when empty string", () => {
    const next = applyAnswerToQuestions([q(1, { answer: "x", checked: true })], 1, "");
    expect(next[0].answer).toBeUndefined();
    expect(next[0].checked).toBe(false);
  });
});

describe("analyzing lifecycle", () => {
  it("mark → resolve with fallback when still unanswered", () => {
    const marked = markQuestionAnalyzing([q(5)], 5);
    expect(marked[0].analysisStatus).toBe("analyzing");
    const resolved = resolvePendingAnalyzingQuestion(marked[0], 5, "語音摘要");
    expect(resolved).toMatchObject({
      checked: true,
      answer: "語音摘要",
      analysisStatus: undefined,
    });
  });

  it("resolve keeps existing answer and only clears analyzing", () => {
    const resolved = resolvePendingAnalyzingQuestion(
      q(5, { checked: true, answer: "已答", analysisStatus: "analyzing" }),
      5,
      "fallback",
    );
    expect(resolved.answer).toBe("已答");
    expect(resolved.analysisStatus).toBeUndefined();
  });

  it("clearAnalyzingStatus only touches analyzing pending id", () => {
    const cleared = clearAnalyzingStatus(
      [
        q(1, { analysisStatus: "analyzing" }),
        q(2, { analysisStatus: "analyzing" }),
        q(3, { analysisStatus: "failed" }),
      ],
      1,
    );
    expect(cleared[0].analysisStatus).toBeUndefined();
    expect(cleared[1].analysisStatus).toBe("analyzing");
    expect(cleared[2].analysisStatus).toBe("failed");
  });
});

describe("activeQuestionBankOrDefault / isAudioCaptureBusy", () => {
  it("falls back to defaults when empty", () => {
    const defaults = [q(1)];
    expect(activeQuestionBankOrDefault([], defaults)).toBe(defaults);
    expect(activeQuestionBankOrDefault([q(2)], defaults)[0].id).toBe(2);
  });

  it("detects mic busy states", () => {
    expect(isAudioCaptureBusy("idle", null)).toBe(false);
    expect(isAudioCaptureBusy("recording", null)).toBe(true);
    expect(isAudioCaptureBusy("processing", null)).toBe(true);
    expect(isAudioCaptureBusy("idle", "mic")).toBe(true);
  });
});
