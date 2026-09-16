import { describe, expect, it } from "vitest";
import {
  canEnterStep,
  canGenerateShareCard,
  getPublishReadiness,
  getShareChecklist,
  getStepStatus,
  isStep1Complete,
  isStep2Complete,
  isStep3Complete,
  mirrorSetupIntoPropertyDraft,
} from "./readiness";

const base = {
  address: "",
  viewingAt: "",
  notesCount: 0,
  photosCount: 0,
  clipsCount: 0,
  checkedQuestions: 0,
};

describe("viewing wizard readiness", () => {
  it("requires address + viewingAt for step 1", () => {
    expect(isStep1Complete({ address: "", viewingAt: "2026-09-15T10:00" })).toBe(false);
    expect(isStep1Complete({ address: "1200 Westwood", viewingAt: "" })).toBe(false);
    expect(isStep1Complete({ address: "1200 Westwood", viewingAt: "not-a-date" })).toBe(false);
    expect(
      isStep1Complete({ address: "1200 Westwood", viewingAt: "2026-09-15T10:00:00.000Z" }),
    ).toBe(true);
  });

  it("requires any field content for step 2", () => {
    expect(isStep2Complete({ ...base, notesCount: 0 })).toBe(false);
    expect(isStep2Complete({ ...base, notesCount: 1 })).toBe(true);
    expect(isStep2Complete({ ...base, photosCount: 1 })).toBe(true);
    expect(isStep2Complete({ ...base, clipsCount: 1 })).toBe(true);
    expect(isStep2Complete({ ...base, checkedQuestions: 1 })).toBe(true);
  });

  it("marks step 3 complete only when card opened and sync not failed", () => {
    expect(isStep3Complete({ cardOpened: false, syncStatus: "synced" })).toBe(false);
    expect(isStep3Complete({ cardOpened: true, syncStatus: "failed" })).toBe(false);
    expect(isStep3Complete({ cardOpened: true, syncStatus: "synced" })).toBe(true);
    expect(isStep3Complete({ cardOpened: true, syncStatus: "local_only" })).toBe(true);
  });

  it("computes step statuses for stepper", () => {
    const snap = {
      ...base,
      address: "A",
      viewingAt: "2026-09-15T10:00:00.000Z",
      notesCount: 1,
    };
    expect(getStepStatus(1, 2, snap)).toBe("completed");
    expect(getStepStatus(2, 2, snap)).toBe("active");
    expect(getStepStatus(3, 2, snap)).toBe("empty");
    expect(getStepStatus(1, 1, { ...snap, lookupError: true })).toBe("error");
  });

  it("share checklist lists missing required items", () => {
    const items = getShareChecklist(base);
    expect(items.find((i) => i.id === "address")?.ok).toBe(false);
    expect(items.find((i) => i.id === "viewingAt")?.ok).toBe(false);
    expect(items.find((i) => i.id === "fieldContent")?.ok).toBe(false);
    expect(canGenerateShareCard(base)).toBe(false);

    const ready = {
      ...base,
      address: "A",
      viewingAt: "2026-09-15T10:00:00.000Z",
      photosCount: 1,
    };
    expect(canGenerateShareCard(ready)).toBe(true);
    expect(canGenerateShareCard({ ...ready, syncStatus: "failed" })).toBe(false);
  });

  it("gates entering later steps", () => {
    expect(canEnterStep(2, base)).toBe(false);
    expect(
      canEnterStep(2, { ...base, address: "A", viewingAt: "2026-09-15T10:00:00.000Z" }),
    ).toBe(true);
    expect(
      canEnterStep(3, { ...base, address: "A", viewingAt: "2026-09-15T10:00:00.000Z" }),
    ).toBe(true);
  });

  it("mirrors setup fields into propertyDraft", () => {
    const next = mirrorSetupIntoPropertyDraft(
      { city: "Coquitlam" },
      {
        viewingAt: "2026-09-15T10:00:00.000Z",
        unitLabel: "1202",
        priceLabel: "899k",
        layoutLabel: "2B2B",
        listingUrl: "https://example.com",
        setupNotes: "hello",
      },
    );
    expect(next.city).toBe("Coquitlam");
    expect(next.unitLabel).toBe("1202");
    expect(next.viewingAt).toBe("2026-09-15T10:00:00.000Z");
  });
});

describe("publish readiness", () => {
  it("requires uploaded remote paths for every selected item", () => {
    const media = [
      { id: "a", uploadStatus: "uploaded" as const, remotePath: "u/v/photos/a.jpg" },
      { id: "b", uploadStatus: "failed" as const, remotePath: null },
    ];
    expect(getPublishReadiness(["a"], media)).toEqual({ ready: true, blockingIds: [] });
    expect(getPublishReadiness(["a", "b", "missing"], media)).toEqual({
      ready: false,
      blockingIds: ["b", "missing"],
    });
  });
});
