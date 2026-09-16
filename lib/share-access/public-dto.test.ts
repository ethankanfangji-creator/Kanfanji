import { describe, expect, it } from "vitest";
import {
  assertNoForbiddenPublicKeys,
  generateShareToken,
  isShareTokenFormat,
  resolveShareLinkGate,
  toPublicSharePayload,
} from "./index";
import type { Viewing } from "@/lib/types";

const baseViewing: Viewing = {
  id: "view-1",
  user_id: "user-secret",
  address: "88 Main",
  tags: ["tag"],
  market: "CA",
  questions: [{ id: 1, text: "secret q", checked: false }],
  notes: [{ id: 1, duration: 1, transcript: "full transcript secret", matched: [] }],
  pros: ["light", "quiet", "fee ok", "extra"],
  risks: ["panel"],
  photo_urls: ["https://example.com/a.jpg"],
  video_urls: ["https://example.com/v.mp4"],
  audio_urls: ["https://example.com/a.webm"],
  is_pro: true,
  property: {
    decisionSummary: {
      version: 1,
      address: "88 Main",
      viewingAt: "",
      unitLabel: "",
      priceLabel: "",
      layoutLabel: "2B",
      listingUrl: "",
      setupNotes: "",
      overallRating: 4,
      pros: [{ id: "p1", text: "Bright", selected: true }],
      risks: [{ id: "r1", text: "Panel", selected: true }],
      facts: [],
      followUps: [],
      actionItems: [],
      photos: [
        {
          id: "1",
          url: "https://example.com/a.jpg",
          tag: "living",
          note: "south",
          selected: true,
          remotePath: "user-secret/private/photo.jpg",
          internalOnly: "must not leak",
        },
      ],
      disclaimer: "AI disclaimer",
      generatedAt: "2026-09-15T12:00:00.000Z",
    },
    decisionSummaryDraft: { should: "not leak" },
    liveAudioMarkers: [{ id: "m1" }],
  },
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-15T12:00:00.000Z",
};

describe("share access public dto", () => {
  it("projects least-privilege payload without forbidden keys", () => {
    const payload = toPublicSharePayload({ viewing: baseViewing });
    expect(payload.status).toBe("active");
    expect(payload.capability).toBe("read");
    expect(payload.decisionSummary?.pros[0]?.text).toBe("Bright");
    const leaks = assertNoForbiddenPublicKeys(payload);
    expect(leaks).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain("full transcript");
    expect(JSON.stringify(payload)).not.toContain("user-secret");
    expect(JSON.stringify(payload)).not.toContain("decisionSummaryDraft");
    expect(JSON.stringify(payload)).not.toContain("remotePath");
    expect(JSON.stringify(payload)).not.toContain("internalOnly");
    expect(JSON.stringify(payload)).not.toContain("user-secret/private");
  });

  it("caps legacy highlights when no decision summary", () => {
    const viewing = {
      ...baseViewing,
      property: {},
    };
    const payload = toPublicSharePayload({ viewing });
    expect(payload.decisionSummary).toBeNull();
    expect(payload.legacyHighlights?.pros).toHaveLength(3);
    expect(assertNoForbiddenPublicKeys(payload)).toEqual([]);
  });
});

describe("share link gate", () => {
  it("resolves missing revoked expired password and active", () => {
    expect(resolveShareLinkGate({ found: false })).toBe("missing");
    expect(resolveShareLinkGate({ found: true, revokedAt: "2026-01-01" })).toBe("revoked");
    expect(
      resolveShareLinkGate({
        found: true,
        expiresAt: "2020-01-01T00:00:00.000Z",
        now: new Date("2026-01-01"),
      }),
    ).toBe("expired");
    expect(
      resolveShareLinkGate({ found: true, passwordHash: "scrypt$x$y", unlocked: false }),
    ).toBe("password_required");
    expect(resolveShareLinkGate({ found: true })).toBe("active");
  });
});

describe("share token", () => {
  it("generates unguessable hex tokens", () => {
    const a = generateShareToken();
    const b = generateShareToken();
    expect(a).not.toBe(b);
    expect(isShareTokenFormat(a)).toBe(true);
    expect(a).toHaveLength(64);
    expect(isShareTokenFormat("123")).toBe(false);
  });
});
