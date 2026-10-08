import { describe, expect, it } from "vitest";
import { notesFingerprint } from "./briefing";
import {
  collectReportMediaRefs,
  formatBriefingIntroForReport,
  formatPropertyFactsForReport,
  notesTranscript,
  reclassifyNegotiationRisks,
} from "./notes-report-text";
import { createUserMessage } from "./types";

describe("notes-only report inputs", () => {
  it("keeps 不吵 as its own note fingerprint distinct from 吵", () => {
    const quiet = createUserMessage({ type: "text", text: "不吵" });
    const loud = createUserMessage({ type: "text", text: "吵" });
    expect(quiet.text).toBe("不吵");
    expect(notesFingerprint([quiet])).not.toBe(notesFingerprint([loud]));
  });

  it("includes photo analysis in the transcript", () => {
    const photo = createUserMessage({
      type: "photo",
      text: "客廳東側",
      analysis: "疑似壁癌",
      media: [
        {
          id: "m1",
          kind: "image",
          name: "wall.jpg",
          mime: "image/jpeg",
          size: 12,
          path: "u/v/photos/wall",
        },
      ],
    });
    const transcript = notesTranscript([photo]);
    expect(transcript).not.toContain("[照片]");
    expect(transcript).toContain("現場照片說明");
    expect(transcript).toContain("客廳東側");
  });

  it("does not emit bare photo placeholders without captions", () => {
    const photo = createUserMessage({
      type: "photo",
      media: [
        {
          id: "m1",
          kind: "image",
          name: "a.jpg",
          mime: "image/jpeg",
          size: 1,
          path: "p1",
        },
      ],
    });
    const transcript = notesTranscript([photo]);
    expect(transcript).not.toMatch(/\[照片\]/);
    expect(transcript).toContain("無文字說明");
  });

  it("collects image and video media refs", () => {
    const photo = createUserMessage({
      type: "photo",
      media: [
        {
          id: "m1",
          kind: "image",
          name: "a.jpg",
          mime: "image/jpeg",
          size: 1,
          path: "p1",
        },
      ],
    });
    const fileVideo = createUserMessage({
      type: "video",
      fileName: "clip.mp4",
      media: [
        {
          id: "m2",
          kind: "video",
          name: "clip.mp4",
          mime: "video/mp4",
          size: 2,
          path: "v1",
        },
      ],
    });
    const doc = createUserMessage({
      type: "file",
      fileName: "hoa.pdf",
      media: [
        {
          id: "m-doc",
          kind: "file",
          name: "hoa.pdf",
          mime: "application/pdf",
          size: 3,
          path: "u/v/files/hoa.pdf",
        },
      ],
    });
    const refs = collectReportMediaRefs([photo, fileVideo, doc]);
    expect(refs.map((item) => item.kind)).toEqual(["image", "video", "file"]);
  });

  it("describes video notes without placeholder tokens", () => {
    const video = createUserMessage({
      type: "video",
      media: [
        {
          id: "m3",
          kind: "video",
          name: "clip.mp4",
          mime: "video/mp4",
          size: 2,
          path: "v2",
        },
      ],
    });
    const transcript = notesTranscript([video]);
    expect(transcript).not.toMatch(/\[影片\]/);
    expect(transcript).toContain("無文字說明");
  });

  it("moves negotiation phrasing out of risks into followUps", () => {
    const result = reclassifyNegotiationRisks(
      ["壁癌", "經紀說有議價空間"],
      ["管理費待確認"],
    );
    expect(result.risks).toEqual(["壁癌"]);
    expect(result.followUps).toContain("經紀說有議價空間");
    expect(result.followUps).toContain("管理費待確認");
  });

  it("formats verified property facts for the report prompt", () => {
    const empty = formatPropertyFactsForReport([]);
    expect(empty).toContain("PROPERTY_FACTS: []");
    const block = formatPropertyFactsForReport([
      {
        field: "transit.bus",
        value: "Glenayre Dr（步行約 4 分）",
        source: "Google Places",
      },
      {
        field: "zoning.code",
        value: "RS1",
        source: "Metro open data",
      },
    ]);
    expect(block).toContain("PROPERTY_FACTS:");
    expect(block).toContain("transit.bus");
    expect(block).toContain("zoning.code");
    expect(block).toContain("Google Places");
  });

  it("formats briefing intro for the report prompt", () => {
    expect(formatBriefingIntroForReport(null)).toContain("BRIEFING_INTRO: (none)");
    const block = formatBriefingIntroForReport({
      summary: "這棟在 Glenayre，走路到公車站約四分鐘。",
      sources: ["Google Places"],
      points: [{ text: "近公園", source: "OSM" }],
    });
    expect(block).toContain("BRIEFING_INTRO");
    expect(block).toContain("Glenayre");
    expect(block).toContain("近公園");
    expect(block).toContain("Google Places");
  });
});
