// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/I18nProvider";
import { IconRail } from "./IconRail";
import type { ViewingChatThread } from "@/lib/viewing-chat/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => null,
  isSupabaseConfigured: () => false,
}));

vi.mock("@/lib/sync", () => ({
  resetSyncEngineSingleton: vi.fn(),
}));

vi.mock("@/lib/idb/draft-store", () => ({
  setPersistenceAccountScope: vi.fn(),
}));

afterEach(() => cleanup());

beforeEach(() => {
  window.localStorage.setItem("kanfangji.locale", "zh-Hant");
});

function thread(id: string, address: string): ViewingChatThread {
  const now = new Date().toISOString();
  return {
    id,
    address,
    normalizedAddress: address,
    messages: [],
    updatedAt: now,
    createdAt: now,
    pinned: false,
    report: null,
    metadata: null,
  };
}

function renderRail(extra?: {
  compareMode?: boolean;
  selectedIds?: string[];
  onSelectThread?: (id: string) => void;
  onToggleSelect?: (id: string) => void;
}) {
  const onSelectThread = extra?.onSelectThread ?? vi.fn();
  const onToggleSelect = extra?.onToggleSelect ?? vi.fn();
  render(
    <I18nProvider>
      <IconRail
        sidebarOpen
        onToggleSidebar={vi.fn()}
        onNew={vi.fn()}
        onOpenSearch={vi.fn()}
        onOpenMedia={vi.fn()}
        threads={["a", "b", "c", "d"].map((id) => thread(id, `道路${id}`))}
        activeId={null}
        onSelectThread={onSelectThread}
        onDeleteThread={vi.fn()}
        onTogglePinThread={vi.fn()}
        compareMode={extra?.compareMode ?? false}
        selectedIds={extra?.selectedIds ?? []}
        onToggleCompareMode={vi.fn()}
        onToggleSelect={onToggleSelect}
        onOpenCompare={vi.fn()}
      />
    </I18nProvider>,
  );
  return { onSelectThread, onToggleSelect };
}

describe("IconRail compare mode", () => {
  it("checks a row without opening the thread and disables compare under 2", async () => {
    const user = userEvent.setup();
    const { onSelectThread, onToggleSelect } = renderRail({ compareMode: true, selectedIds: [] });

    await user.click(screen.getByRole("checkbox", { name: /道路b/ }));
    expect(onSelectThread).not.toHaveBeenCalled();
    expect(onToggleSelect).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("button", { name: "釘選紀錄" })).toBeNull();
    expect(screen.queryByRole("button", { name: "刪除紀錄" })).toBeNull();
    expect(screen.getByRole("button", { name: "比較 (0)" })).toBeDisabled();
  });

  it("does not select a fourth row", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { onToggleSelect } = renderRail({
      compareMode: true,
      selectedIds: ["a", "b", "c"],
    });

    const fourth = screen.getByRole("checkbox", { name: /道路d/ });
    expect(fourth).toHaveAttribute("aria-disabled", "true");
    await user.click(fourth);
    expect(onToggleSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("最多比較 3 筆");
  });
});
