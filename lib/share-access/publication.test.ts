import { describe, expect, it } from "vitest";
import { buildChatReportPublication, ChatReportShareSnapshotSchema } from "./publication";

describe("buildChatReportPublication", () => {
  it("omits chat messages and viewing ids", () => {
    const snapshot = buildChatReportPublication({
      id: "viewing-secret-id",
      user_id: "user-secret-id",
      address: "1 Main St",
      updated_at: "2026-09-28T00:00:00.000Z",
      report: {
        summary: "Bright living room",
        pros: ["light"],
        risks: ["noise"],
        checklist: [],
        generatedAt: "2026-09-28T00:00:00.000Z",
      },
      chat_state: {
        propertyRecord: {
          fields: {
            price: { value: "1250 萬", status: "confirmed" },
            odor: { value: "unknown note", status: "unknown" },
          },
        },
      },
    }).snapshot;
    const encoded = JSON.stringify(snapshot);
    expect(encoded).not.toContain("價格 999 萬");
    expect(encoded).not.toContain("viewing-secret-id");
    expect(encoded).not.toContain("user-secret-id");
    expect(snapshot.fields.map((field) => field.fieldId)).toEqual(["price"]);
  });

  it("publishes an address when the viewing has no report yet", () => {
    const snapshot = buildChatReportPublication({
        id: "viewing-no-report",
        user_id: "user-no-report",
      address: "1 Main",
      report: null,
      chat_state: {},
      updated_at: "2026-09-28T00:00:00.000Z",
    }).snapshot;
    expect(snapshot.address).toBe("1 Main");
    expect(snapshot.summary).toBeNull();
  });

  it("rejects unknown snapshot keys", () => {
    expect(
      ChatReportShareSnapshotSchema.safeParse({
        version: 2,
        kind: "chat_report",
        title: "看房報告",
        address: "1 Main",
        publishedAt: "2026-09-28T00:00:00.000Z",
        reportGeneratedAt: "2026-09-28T00:00:00.000Z",
        summary: null,
        pros: [],
        risks: [],
        checklist: [],
        fields: [],
        leaked: true,
      }).success,
    ).toBe(false);
  });
});
