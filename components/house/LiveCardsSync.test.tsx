// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveCardsSync } from "./LiveCardsSync";

const refresh = vi.fn();
let emit: ((payload: { new: Record<string, unknown> }) => void) | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    channel: () => ({
      on: (_event: string, _filter: unknown, callback: (payload: { new: Record<string, unknown> }) => void) => {
        emit = callback;
        return { subscribe: () => ({}) };
      },
    }),
    removeChannel: () => undefined,
  }),
}));

afterEach(() => {
  cleanup();
  emit = null;
  refresh.mockClear();
});

describe("LiveCardsSync", () => {
  it("updates a card status from realtime without adding presence", () => {
    render(
      <LiveCardsSync
        viewingId="11111111-1111-4111-8111-111111111111"
        address="88 Main St"
        code="K7NP3Q"
        cards={[
          {
            templateId: "light",
            name: "採光",
            icon: "☀️",
            sortOrder: 2,
            isSystem: true,
            status: null,
            notes: null,
            voiceTranscript: null,
          },
        ]}
      />,
    );

    expect(emit).toBeTypeOf("function");
    act(() => {
      emit?.({
        new: { template_id: "light", status: "good", notes: null, photos: [] },
      });
    });

    expect(screen.getByText("✅ 好")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByText(/正在拍/)).toBeNull();
  });
});
