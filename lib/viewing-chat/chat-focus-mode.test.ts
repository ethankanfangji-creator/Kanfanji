import { describe, expect, it } from "vitest";
import { isChatFocusMode } from "./chat-focus-mode";

describe("isChatFocusMode", () => {
  const base = {
    hasActiveThread: true,
    historyOpen: false,
    searchOpen: false,
    mediaOpen: false,
    accountOpen: false,
    isMobileViewport: true,
  };

  it("is on for an active mobile thread with no overlays", () => {
    expect(isChatFocusMode(base)).toBe(true);
  });

  it("stays off on the empty address / new-viewing state", () => {
    expect(isChatFocusMode({ ...base, hasActiveThread: false })).toBe(false);
  });

  it("exits when a mobile overlay is open", () => {
    expect(isChatFocusMode({ ...base, searchOpen: true })).toBe(false);
    expect(isChatFocusMode({ ...base, mediaOpen: true })).toBe(false);
    expect(isChatFocusMode({ ...base, accountOpen: true })).toBe(false);
    expect(isChatFocusMode({ ...base, historyOpen: true })).toBe(false);
  });

  it("ignores desktop history rail for focus (nav already md:hidden)", () => {
    expect(
      isChatFocusMode({
        ...base,
        isMobileViewport: false,
        historyOpen: true,
      }),
    ).toBe(true);
  });
});
