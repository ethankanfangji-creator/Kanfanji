import { describe, expect, it } from "vitest";
import {
  buildChatReportPublication,
  ChatReportShareSnapshotSchema,
  ChatReportShareSnapshotV2Schema,
  isPublishedShareSnapshot,
} from "./publication";

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
    expect(snapshot.version).toBe(3);
    expect(snapshot).not.toHaveProperty("fields");
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
    expect(snapshot.version).toBe(3);
  });

  it("rejects unknown snapshot keys on v3", () => {
    expect(
      ChatReportShareSnapshotSchema.safeParse({
        version: 3,
        kind: "chat_report",
        title: "看房報告",
        address: "1 Main",
        publishedAt: "2026-09-28T00:00:00.000Z",
        reportGeneratedAt: "2026-09-28T00:00:00.000Z",
        summary: null,
        pros: [],
        risks: [],
        leaked: true,
      }).success,
    ).toBe(false);
  });

  it("publishes sectioned report fields and scores into the snapshot", () => {
    const snapshot = buildChatReportPublication({
      id: "viewing-1",
      user_id: "user-1",
      address: "1167 Victory Drive",
      updated_at: "2026-09-28T00:00:00.000Z",
      report: {
        title: "1167 Victory Drive — 看房評估報告",
        overview: "## 總覽\n採光佳",
        interior: "## 室內\n廚房新",
        outdoorLand: "## 戶外\n院子大",
        transitLifestyle: "## 生活圈\n近捷運",
        pricing: "## 價格\n合理",
        pros: ["light", "yard", "kitchen", "quiet"],
        risks: ["noise", "HOA"],
        scores: {
          items: [
            { label: "採光", score: 4.5 },
            { label: "格局", score: 4 },
          ],
          overall: "值得續談",
          highlight: "院子與採光",
          biggestQuestion: "HOA 費用？",
        },
        verdict: "## 結論\n可進短名單",
        nextSteps: ["問 HOA", "再看一次晚上"],
        summary: "# assembled\nfallback",
        generatedAt: "2026-09-28T00:00:00.000Z",
        meta: {
          viewingDate: "2026-09-28",
          askingPrice: "1250 萬",
          layout: "3房",
        },
      },
      chat_state: {},
    }).snapshot;

    expect(snapshot.version).toBe(3);
    expect(snapshot.title).toBe("1167 Victory Drive — 看房評估報告");
    expect(snapshot.overview).toContain("採光佳");
    expect(snapshot.interior).toContain("廚房新");
    expect(snapshot.pros).toEqual(["light", "yard", "kitchen", "quiet"]);
    expect(snapshot.risks).toEqual(["noise", "HOA"]);
    expect(snapshot.scores?.items).toHaveLength(2);
    expect(snapshot.scores?.biggestQuestion).toBe("HOA 費用？");
    expect(snapshot.verdict).toContain("短名單");
    expect(snapshot.nextSteps).toEqual(["問 HOA", "再看一次晚上"]);
    expect(snapshot.meta?.askingPrice).toBe("1250 萬");
    expect(snapshot).not.toHaveProperty("fields");
    expect(snapshot).not.toHaveProperty("checklist");
  });

  it("publishes owned report gallery images into mediaManifest", () => {
    const path = "user-1/viewing-1/photos/kitchen.jpg";
    const { mediaManifest, snapshot } = buildChatReportPublication({
      id: "viewing-1",
      user_id: "user-1",
      address: "1 Main St",
      updated_at: "2026-09-28T00:00:00.000Z",
      photo_urls: [path],
      report: {
        summary: "Bright kitchen",
        pros: [],
        risks: [],
        generatedAt: "2026-09-28T00:00:00.000Z",
        mediaRefs: [
          {
            id: "m1",
            kind: "image",
            name: "kitchen.jpg",
            mime: "image/jpeg",
            size: 12,
            path,
          },
          {
            id: "m2",
            kind: "video",
            name: "clip.mp4",
            mime: "video/mp4",
            size: 12,
            path: "user-1/viewing-1/videos/clip.mp4",
          },
          {
            id: "m3",
            kind: "image",
            name: "stray.jpg",
            mime: "image/jpeg",
            size: 12,
            path: "other/viewing-1/photos/stray.jpg",
          },
        ],
      },
      chat_state: {},
    });
    expect(mediaManifest).toEqual([{ id: "m1", path }]);
    expect(snapshot.summary).toBe("Bright kitchen");
  });

  it("still accepts legacy v2 snapshots for resolve compatibility", () => {
    const legacy = {
      version: 2 as const,
      kind: "chat_report" as const,
      title: "看房報告",
      address: "1 Main",
      publishedAt: "2026-09-28T00:00:00.000Z",
      reportGeneratedAt: "2026-09-28T00:00:00.000Z",
      summary: "# old summary",
      pros: ["a"],
      risks: ["b"],
      followUps: [],
      checklist: [],
      fields: [],
    };
    expect(ChatReportShareSnapshotV2Schema.safeParse(legacy).success).toBe(true);
    expect(isPublishedShareSnapshot(legacy)).toBe(true);
  });
});
