// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { createLocalThread, getLocalThread, listLocalThreads, patchLocalThread } from "./local-store";

describe("site pin survives refresh", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps the tapped coordinate on the local record", () => {
    const thread = createLocalThread("2143 Spring Port Moody", [], null);
    patchLocalThread(thread.id, {
      sitePin: { lat: 49.2815, lng: -122.8512, source: "map" },
    });
    const stored = JSON.parse(localStorage.getItem("kanfangji.viewingChat.threads.v1") ?? "[]") as Array<{
      sitePin?: { lat: number };
    }>;
    expect(stored[0]?.sitePin?.lat).toBe(49.2815);
    expect(listLocalThreads()[0]?.sitePin).toEqual({
      lat: 49.2815,
      lng: -122.8512,
      source: "map",
    });
    expect(getLocalThread(thread.id)?.sitePin?.lng).toBe(-122.8512);
  });
});
