import { describe, expect, it } from "vitest";
import {
  buildProviderAvailabilityNotes,
  formatSkipReasonZh,
} from "./provider-availability-notes";

describe("provider availability notes", () => {
  it("formats skip reasons in Chinese", () => {
    expect(formatSkipReasonZh("missing_key")).toMatch(/金鑰/);
    expect(formatSkipReasonZh("stub_only")).toMatch(/授權|尚未/);
  });

  it("lists used and skipped providers without env names", () => {
    const { notes, availability } = buildProviderAvailabilityNotes({
      used: [{ id: "bing_search" }],
      skipped: [
        { id: "google_maps", reason: "missing_key" },
        { id: "mls_crea_ddf", reason: "stub_only" },
      ],
      region: "CA",
    });
    expect(notes.join("")).toMatch(/bing_search|已嘗試/);
    expect(notes.join("")).toMatch(/未設定金鑰|尚未接上|授權/);
    expect(notes.join("")).not.toMatch(/GOOGLE_MAPS|API_KEY|SECRET/);
    expect(availability.some((a) => a.id === "google_maps" && !a.available)).toBe(
      true,
    );
  });
});
