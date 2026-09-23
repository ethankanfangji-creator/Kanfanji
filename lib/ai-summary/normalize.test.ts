import { describe, expect, it } from "vitest";
import {
  claimsToLegacyStrings,
  softDeleteClaim,
  updateClaimText,
  validateAndNormalizeSummary,
} from "./normalize";
import {
  fixtureEmpty,
  fixtureLegacyStrings,
  fixturePartialBadClaims,
  fixtureTranscriptOnly,
  fixtureValidStructured,
} from "./fixtures";

describe("validateAndNormalizeSummary", () => {
  it("accepts a full structured payload", () => {
    const result = validateAndNormalizeSummary(fixtureValidStructured, {
      mediaId: "m1",
      noteId: 9,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.version).toBe(1);
    expect(result.value.facts[0]?.text).toContain("Roof");
    expect(result.value.facts[0]?.sources[0]?.timestampSec).toBe(12);
    expect(result.value.mediaId).toBe("m1");
    expect(result.value.risks[0]?.confidence).toBe("needs_verification");
  });

  it("normalizes legacy string arrays and new_questions → followUps", () => {
    const result = validateAndNormalizeSummary(fixtureLegacyStrings);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pros[0]?.text).toBe("採光不錯");
    expect(result.value.pros[0]?.confidence).toBe("needs_verification");
    expect(result.value.followUps[0]?.text).toContain("管理費");
    expect(claimsToLegacyStrings(result.value.pros)).toEqual(["採光不錯"]);
  });

  it("accepts transcript-only empty claim lists", () => {
    const result = validateAndNormalizeSummary(fixtureTranscriptOnly);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.transcript).toContain("open house");
    expect(result.value.pros).toEqual([]);
  });

  it("rejects empty payload with no transcript and no claims", () => {
    const result = validateAndNormalizeSummary(fixtureEmpty);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/不完整|無法/);
  });

  it("salvages partial/malformed claims with warnings", () => {
    const result = validateAndNormalizeSummary(fixturePartialBadClaims);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.facts.some((f) => f.text.includes("Highway"))).toBe(true);
    expect(result.value.facts.some((f) => f.text.includes("Plain string"))).toBe(true);
    expect(result.value.risks).toHaveLength(1);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("rejects non-objects", () => {
    const result = validateAndNormalizeSummary(null);
    expect(result.ok).toBe(false);
  });
});

describe("editable summary helpers", () => {
  it("updates and soft-deletes claims", () => {
    const parsed = validateAndNormalizeSummary(fixtureValidStructured);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    let summary = updateClaimText(parsed.value, "pros", "p1", "Bright south living room");
    expect(summary.pros.find((p) => p.id === "p1")?.text).toBe("Bright south living room");
    summary = softDeleteClaim(summary, "risks", "r1");
    expect(summary.risks.find((r) => r.id === "r1")?.deleted).toBe(true);
    expect(claimsToLegacyStrings(summary.risks)).toEqual([]);
  });
});
