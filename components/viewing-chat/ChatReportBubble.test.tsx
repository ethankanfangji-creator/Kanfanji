// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChatReportBubble } from "./ChatReportBubble";

afterEach(() => cleanup());

describe("ChatReportBubble", () => {
  it("renders the English title, summary, and checklist", () => {
    render(
      <ChatReportBubble
        summary="Quiet street"
        pros={["Light"]}
        risks={["Noise"]}
        checklist={[{ question: "Water", answer: "ok", status: "ok" }]}
        labels={{
          title: "Viewing report",
          pros: "Pros",
          risks: "Risks",
          checklist: "Checklist",
          unconfirmed: "Unconfirmed",
        }}
      />,
    );
    expect(screen.queryByText("看房報告")).toBeNull();
    expect(screen.getByText("Viewing report")).toBeTruthy();
    expect(screen.getByText("Quiet street")).toBeTruthy();
    expect(screen.getByText(/Checklist/)).toBeTruthy();
  });
});
