// @vitest-environment jsdom

import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfflineAppShell } from "./OfflineAppShell";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/components/I18nProvider", () => ({
  useI18n: () => ({
    messages: {
      offline: {
        offline: "Offline",
        updateReady: "Update ready",
        refresh: "Refresh",
      },
    },
  }),
}));

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

let root: Root | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  document.body.innerHTML = "";
});

describe("OfflineAppShell hydration", () => {
  it("keeps server and first-client markup stable when the browser is offline", async () => {
    setNavigatorOnline(true);
    const serverMarkup = renderToString(<OfflineAppShell />);

    setNavigatorOnline(false);
    const container = document.createElement("div");
    container.innerHTML = serverMarkup;
    document.body.append(container);
    const recoverableErrors: unknown[] = [];

    await act(async () => {
      root = hydrateRoot(container, <OfflineAppShell />, {
        onRecoverableError: (error) => recoverableErrors.push(error),
      });
      expect(container.innerHTML).toBe(serverMarkup);
    });

    expect(recoverableErrors).toEqual([]);
    expect(container.innerHTML).toContain("Offline");
  });
});
