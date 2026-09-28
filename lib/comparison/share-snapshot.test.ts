import { describe, expect, it } from "vitest";
import { snapshotFromDraft, snapshotFromThreadColumns } from "./share-snapshot";
import { parseCompareShareSnapshot } from "./share-schema";
import type { ComparisonDraft } from "./types";

const draft: ComparisonDraft = {
  version: 1,
  id: "draft",
  createdAt: "t",
  updatedAt: "t",
  sort: { key: "price", direction: "asc" },
  shareToken: null,
  columns: [
    {
      id: "col-1",
      source: { viewingId: "view-secret", sourceUpdatedAt: "secret-time" },
      title: "100 Main",
      fields: {
        priceLabel: "900000",
        layoutLabel: null,
        locationLabel: null,
        areaLabel: null,
        managementFeeLabel: null,
        overallRating: null,
        pros: [],
        risks: [],
        followUps: [],
      },
      notes: "private note",
      included: true,
    },
    {
      id: "col-2",
      source: { viewingId: "view-2", sourceUpdatedAt: "t" },
      title: "200 Main",
      fields: {
        priceLabel: null,
        layoutLabel: null,
        locationLabel: null,
        areaLabel: null,
        managementFeeLabel: null,
        overallRating: null,
        pros: [],
        risks: [],
        followUps: [],
      },
      notes: "skip",
      included: false,
    },
    {
      id: "col-3",
      source: { viewingId: "view-3", sourceUpdatedAt: "t" },
      title: "300 Main",
      fields: {
        priceLabel: null,
        layoutLabel: null,
        locationLabel: null,
        areaLabel: null,
        managementFeeLabel: null,
        overallRating: null,
        pros: [],
        risks: [],
        followUps: [],
      },
      notes: "",
      included: true,
    },
  ],
};

describe("share snapshots", () => {
  it("drops viewing ids and omits notes unless requested", () => {
    const snapshot = snapshotFromDraft(draft, { includeNotes: false });
    const text = JSON.stringify(snapshot);
    expect(text).not.toContain("view-secret");
    expect(text).not.toContain("secret-time");
    expect(text).not.toContain("200 Main");
    expect(snapshot.rows).not.toContain("notes");
  });

  it("does not copy chat message text into a thread snapshot", () => {
    const snapshot = snapshotFromThreadColumns([
      {
        threadId: "thread",
        rows: {
          address: { text: "100 Main" },
          price: { text: null },
        },
      } as never,
      {
        threadId: "thread-2",
        rows: { address: { text: "200 Main" }, price: { text: null } },
      } as never,
    ]);
    expect(JSON.stringify(snapshot)).not.toContain("價格 999 萬");
  });

  it("rejects an unknown snapshot key", () => {
    expect(() =>
      parseCompareShareSnapshot(
        {
          version: 2,
          source: "chat_history",
          createdAt: "t",
          rows: ["address"],
          columns: [
            { title: "A", cells: { address: { text: "A" } }, extra: true },
            { title: "B", cells: { address: { text: "B" } } },
          ],
        },
        2,
      ),
    ).toThrow();
  });
});
