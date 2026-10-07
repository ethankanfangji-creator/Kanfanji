import { describe, expect, it } from "vitest";
import { mergeMessagesForHydrate } from "./merge-messages-hydrate";

describe("mergeMessagesForHydrate", () => {
  it("keeps newer local messages so deletes are not resurrected from cloud", () => {
    const local = [{ id: "a", text: "keep" }];
    const remote = [
      { id: "a", text: "keep" },
      { id: "b", text: "deleted-locally" },
    ];
    const merged = mergeMessagesForHydrate(
      local,
      remote,
      "2026-10-07T12:00:00.000Z",
      "2026-10-07T11:00:00.000Z",
    );
    expect(merged.map((m) => m.id)).toEqual(["a"]);
  });

  it("takes remote as base when remote is newer, then appends local-only ids", () => {
    const local = [
      { id: "a", text: "old" },
      { id: "c", text: "local-only" },
    ];
    const remote = [
      { id: "a", text: "new" },
      { id: "b", text: "from-cloud" },
    ];
    const merged = mergeMessagesForHydrate(
      local,
      remote,
      "2026-10-07T10:00:00.000Z",
      "2026-10-07T12:00:00.000Z",
    );
    expect(merged.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(merged[0]?.text).toBe("new");
  });
});
