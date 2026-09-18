// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionList } from "./QuestionList";

afterEach(cleanup);

const messages = {
  fieldTitle: "On-site answers",
  progressLabel: "Completed {completed} / {total}",
  sectionUnanswered: "Unanswered",
  sectionAnswered: "Answered",
  emptyUnanswered: "No unanswered questions right now",
  emptyAnswered: "No answered questions yet",
  tip: "Tip: ",
  tipExample: "Try recording.",
  card: {
    answerCta: "Answer question",
    editCta: "Edit answer",
    statusUnanswered: "Unanswered",
    statusProcessing: "In progress",
    statusAnswered: "Answered",
    statusAnalyzing: "Analyzing",
    statusAnalysisFailed: "Analysis failed",
    noteSummaryLabel: "Note: ",
    aiSummaryLabel: "AI summary: ",
  },
  methodSheet: {
    title: "How do you want to answer?",
    description: "Pick a method",
    audio: "Record audio",
    photo: "Take photo",
    video: "Record video",
    note: "Write note",
    close: "Close",
    noteTitle: "Write a note",
    notePlaceholder: "Note…",
    noteSave: "Save answer",
    noteCancel: "Back",
  },
};

describe("QuestionList", () => {
  it("opens answer method sheet and saves a note without leaving the list", async () => {
    const user = userEvent.setup();
    const onSaveAnswer = vi.fn();
    const onSelectMethod = vi.fn();

    render(
      <QuestionList
        messages={messages}
        questions={[
          { id: 1, text: "Any water damage?", checked: false },
          {
            id: 2,
            text: "Noise check",
            checked: true,
            answer: "Loud at night",
            answerPreview: { noteSummary: "Loud at night" },
          },
        ]}
        onSaveAnswer={onSaveAnswer}
        onSelectMethod={onSelectMethod}
      />,
    );

    expect(screen.getByRole("heading", { name: "On-site answers" })).toBeVisible();
    expect(screen.getByText("Completed 1 / 2")).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByRole("heading", { name: "Unanswered" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Answered" })).toBeVisible();
    expect(screen.getByText(/Loud at night/)).toBeVisible();
    expect(screen.getByText(/Note:/)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Answer question" }));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("heading", { name: "How do you want to answer?" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Record audio" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Take photo" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Record video" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Write note" }));
    await user.type(screen.getByPlaceholderText("Note…"), "Ceiling stain");
    await user.click(screen.getByRole("button", { name: "Save answer" }));
    expect(onSaveAnswer).toHaveBeenCalledWith(1, "Ceiling stain");
    expect(onSelectMethod).not.toHaveBeenCalled();
  });

  it("routes capture methods to the parent handler", async () => {
    const user = userEvent.setup();
    const onSelectMethod = vi.fn();

    render(
      <QuestionList
        messages={messages}
        questions={[{ id: 9, text: "Parking?", checked: false }]}
        onSaveAnswer={vi.fn()}
        onSelectMethod={onSelectMethod}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Answer question" }));
    await user.click(screen.getByRole("button", { name: "Take photo" }));
    expect(onSelectMethod).toHaveBeenCalledWith(9, "photo");
  });
});
