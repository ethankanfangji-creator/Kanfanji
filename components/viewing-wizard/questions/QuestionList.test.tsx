// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionList } from "./QuestionList";

afterEach(cleanup);

const messages = {
  fieldTitle: "Viewing focus tickets",
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
    statusToConfirm: "To confirm",
    statusNeedsMore: "Needs more",
    noteSummaryLabel: "Note: ",
    aiSummaryLabel: "AI summary: ",
    priorityHigh: "High",
    priorityMedium: "Medium",
    priorityLow: "Low",
    categories: {
      condition: "Condition",
      transit: "Transit & location",
      amenities: "Daily amenities",
      costs_docs: "Costs & documents",
      onsite_confirm: "Confirm on site",
      other: "Other",
    },
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
  it("groups tickets by category and opens answer sheet", async () => {
    const user = userEvent.setup();
    const onSaveAnswer = vi.fn();
    const onSelectMethod = vi.fn();

    render(
      <QuestionList
        messages={messages}
        questions={[
          {
            id: 1,
            text: "Any water damage at Burquitlam?",
            checked: false,
            category: "condition",
            priority: "high",
            source: "viewing_brief",
          },
          {
            id: 2,
            text: "Noise check",
            checked: true,
            answer: "Loud at night near the street",
            category: "condition",
            priority: "medium",
            source: "viewing_brief",
            answerPreview: { noteSummary: "Loud at night near the street" },
          },
          {
            id: 3,
            text: "Confirm transit access",
            checked: false,
            category: "transit",
            priority: "high",
            source: "viewing_brief",
          },
        ]}
        onSaveAnswer={onSaveAnswer}
        onSelectMethod={onSelectMethod}
      />,
    );

    expect(screen.getByRole("heading", { name: "Viewing focus tickets" })).toBeVisible();
    expect(screen.getByText("Completed 1 / 3")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Condition" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Transit & location" })).toBeVisible();
    expect(screen.getAllByText("To confirm").length).toBeGreaterThan(0);
    expect(screen.getByText(/Loud at night/)).toBeVisible();

    await user.click(screen.getAllByRole("button", { name: "Answer question" })[0]!);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("heading", { name: "How do you want to answer?" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Write note" }));
    expect(screen.getByLabelText("Write a note")).toBeVisible();
    await user.type(screen.getByPlaceholderText("Note…"), "Ceiling stain near kitchen");
    await user.click(screen.getByRole("button", { name: "Save answer" }));
    expect(onSaveAnswer).toHaveBeenCalledWith(1, "Ceiling stain near kitchen");
    expect(onSelectMethod).not.toHaveBeenCalled();
  });
});
