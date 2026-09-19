import { describe, expect, it } from "vitest";
import {
  initialViewingDraftFormState,
  viewingDraftFormReducer,
} from "./draft-state";

describe("viewingDraftFormReducer", () => {
  it("updates setup fields without changing unrelated values", () => {
    const state = viewingDraftFormReducer(initialViewingDraftFormState, {
      type: "setField",
      field: "address",
      value: "123 Main St",
    });

    expect(state).toMatchObject({
      address: "123 Main St",
      wizardStep: 1,
      viewingAt: "",
    });
  });

  it("hydrates a persisted draft atomically", () => {
    const state = viewingDraftFormReducer(initialViewingDraftFormState, {
      type: "hydrate",
      value: {
        wizardStep: 3,
        address: "Restored",
        viewingAt: "2026-09-17T02:00:00.000Z",
        setupNotes: "Keep this",
      },
    });

    expect(state).toEqual({
      ...initialViewingDraftFormState,
      wizardStep: 3,
      address: "Restored",
      viewingAt: "2026-09-17T02:00:00.000Z",
      setupNotes: "Keep this",
    });
  });

  it("resets to a clean local draft", () => {
    const dirty = {
      ...initialViewingDraftFormState,
      wizardStep: 2 as const,
      address: "Dirty",
    };

    expect(viewingDraftFormReducer(dirty, { type: "reset" })).toEqual(
      initialViewingDraftFormState,
    );
  });
});
