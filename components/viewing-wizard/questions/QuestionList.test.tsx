// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionList } from "./QuestionList";

afterEach(cleanup);

const messages = {
  title: "QUESTION BANK",
  photoAi: "PHOTO AI",
  followUp: "FOLLOW-UP",
  checklistSection: "On-site checks",
  tip: "Tip: ",
  tipExample: "Try recording.",
  matched: "Matched",
  countLabel: "{count} Qs",
  card: {
    photoBadge: "Photo",
    followBadge: "Ask",
    checklistBadge: "Check",
    tagLabel: "Tag: ",
    byDialogue: "From: ",
    answered: "Answered",
  },
  answer: {
    title: "Answer this question",
    placeholder: "Note…",
    save: "Save answer",
    clear: "Clear",
    empty: "Select a question below",
  },
};

describe("QuestionList", () => {
  it("focuses answering via AnswerSheet and toggles questions", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onSaveAnswer = vi.fn();

    render(
      <QuestionList
        messages={messages}
        marketLabel="CA"
        questions={[
          { id: 1, text: "Any water damage?", checked: false },
          {
            id: 800_000,
            text: "Noise check",
            checked: false,
            source: "checklist",
            basedOn: "preset:noise",
          },
        ]}
        onToggle={onToggle}
        onSaveAnswer={onSaveAnswer}
      />,
    );

    expect(screen.getByText("Select a question below")).toBeVisible();
    expect(screen.getByText("On-site checks")).toBeVisible();

    await user.click(screen.getByRole("button", { name: /Any water damage/i }));
    expect(screen.getByRole("heading", { name: "Answer this question" })).toBeVisible();
    await user.type(screen.getByPlaceholderText("Note…"), "Ceiling stain");
    await user.click(screen.getByRole("button", { name: "Save answer" }));
    expect(onSaveAnswer).toHaveBeenCalledWith(1, "Ceiling stain");

    await user.click(screen.getByRole("checkbox", { name: "Noise check" }));
    expect(onToggle).toHaveBeenCalledWith(800_000);
  });
});
