import { describe, expect, it } from "vitest";
import { projectViewingForRole } from "./projection";

const row = {
  id: "view-1",
  address: "1 Main",
  tags: [],
  market: null,
  questions: [],
  notes: [{ transcript: "private" }],
  pros: [],
  risks: [],
  photo_urls: [],
  video_urls: [],
  audio_urls: ["owner/view/audios/one.webm"],
  share_token: "secret",
  property: {
    city: "Vancouver",
    shareAccess: { passwordHash: "secret" },
    fieldChecklist: ["private"],
    liveAudioMarkers: ["private"],
    decisionSummaryDraft: { private: true },
    futureInternalField: "private",
  },
  revision: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  audit_internal: "private",
  future_database_column: "private",
};

describe("role-aware viewing projection", () => {
  it.each([
    ["viewer", false, false, false],
    ["commenter", true, true, false],
    ["editor", true, true, false],
    ["owner", true, true, true],
  ] as const)(
    "enforces the %s data capability matrix",
    (role, canReadNotes, canReadAudio, canReadOwnerFields) => {
      const dto = projectViewingForRole(row, role);
      expect(Object.hasOwn(dto, "notes")).toBe(canReadNotes);
      expect(Object.hasOwn(dto, "audio_urls")).toBe(canReadAudio);
      expect(Object.hasOwn(dto, "share_token")).toBe(canReadOwnerFields);
      expect(dto.role).toBe(role);
    },
  );

  it("gives viewers only the explicit safe allowlist", () => {
    const dto = projectViewingForRole(row, "viewer");
    expect(dto.address).toBe("1 Main");
    expect(dto).not.toHaveProperty("property");
    expect(dto).not.toHaveProperty("audio_urls");
    expect(dto).not.toHaveProperty("notes");
    expect(dto).not.toHaveProperty("share_token");
    expect(dto).not.toHaveProperty("future_database_column");
    expect(dto).not.toHaveProperty("audit_internal");
  });

  it.each(["commenter", "editor"] as const)(
    "strips nested internals and future fields for %s",
    (role) => {
      const dto = projectViewingForRole(row, role);
      expect(dto.property).toEqual({ city: "Vancouver" });
      expect(dto).not.toHaveProperty("future_database_column");
    },
  );

  it("still strips unknown top-level fields for owners", () => {
    expect(projectViewingForRole(row, "owner"))
      .not.toHaveProperty("future_database_column");
  });
});
