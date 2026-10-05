// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const getUser = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser },
  }),
}));

vi.mock("@/components/viewing-chat/ViewingChatApp", () => ({
  ViewingChatApp: () => <div>guest-home-shell</div>,
}));

import { ViewingChatIndex } from "./ViewingChatIndex";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  getUser.mockResolvedValue({ data: { user: null } });
});

describe("ViewingChatIndex", () => {
  it("loads the home shell for signed-out guests", async () => {
    render(<ViewingChatIndex />);
    await waitFor(() => {
      expect(screen.getByText("guest-home-shell")).toBeTruthy();
    });
    expect(replace).not.toHaveBeenCalledWith(expect.stringContaining("/login"));
  });
});
