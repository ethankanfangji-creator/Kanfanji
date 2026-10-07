// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BRIEFING_STAGE_DWELL_MS,
  BriefingLoadingPanel,
} from "./BriefingLoadingPanel";

afterEach(cleanup);

describe("BriefingLoadingPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds locate briefly, search longest, then stays on write", () => {
    render(
      <BriefingLoadingPanel
        ariaLabel="Searching…"
        stages={["Locate", "Search", "Write"]}
      />,
    );

    expect(screen.getByText("Locate")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(BRIEFING_STAGE_DWELL_MS[0] - 1);
    });
    expect(screen.getByText("Locate")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText("Search")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(BRIEFING_STAGE_DWELL_MS[1] - 1);
    });
    expect(screen.getByText("Search")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText("Write")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText("Write")).toBeInTheDocument();
    expect(screen.queryByText("Locate")).not.toBeInTheDocument();
  });
});
