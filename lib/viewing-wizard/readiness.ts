export type WizardStep = 1 | 2 | 3;

export type StepUiStatus = "empty" | "active" | "completed" | "error";

export type ShareChecklistItemId =
  | "address"
  | "viewingAt"
  | "fieldContent"
  | "syncOk";

export type ShareChecklistItem = {
  id: ShareChecklistItemId;
  ok: boolean;
  /** Optional items do not block `ready`. */
  required: boolean;
};

export type WizardSnapshot = {
  address: string;
  viewingAt: string;
  unitLabel?: string;
  notesCount: number;
  photosCount: number;
  clipsCount: number;
  checkedQuestions: number;
  identified?: boolean;
  cardOpened?: boolean;
  syncStatus?: string | null;
  lookupError?: boolean;
  captureError?: boolean;
};

export function hasAddress(address: string): boolean {
  return address.trim().length > 0;
}

export function hasViewingAt(viewingAt: string): boolean {
  return viewingAt.trim().length > 0 && !Number.isNaN(Date.parse(viewingAt));
}

export function hasFieldContent(input: {
  notesCount: number;
  photosCount: number;
  clipsCount: number;
  checkedQuestions: number;
}): boolean {
  return (
    input.notesCount > 0 ||
    input.photosCount > 0 ||
    input.clipsCount > 0 ||
    input.checkedQuestions > 0
  );
}

export function isStep1Complete(snap: Pick<WizardSnapshot, "address" | "viewingAt">): boolean {
  return hasAddress(snap.address) && hasViewingAt(snap.viewingAt);
}

export function isStep2Complete(
  snap: Pick<WizardSnapshot, "notesCount" | "photosCount" | "clipsCount" | "checkedQuestions">,
): boolean {
  return hasFieldContent(snap);
}

export function isStep3Complete(
  snap: Pick<WizardSnapshot, "cardOpened" | "syncStatus">,
): boolean {
  if (!snap.cardOpened) return false;
  const status = snap.syncStatus ?? "local_only";
  return status !== "failed" && status !== "conflict" && status !== "error";
}

export function getStepStatus(
  step: WizardStep,
  activeStep: WizardStep,
  snap: WizardSnapshot,
): StepUiStatus {
  if (step === activeStep) {
    if (step === 1 && snap.lookupError) return "error";
    if (step === 2 && snap.captureError) return "error";
    if (
      step === 3 &&
      (snap.syncStatus === "failed" || snap.syncStatus === "conflict" || snap.syncStatus === "error")
    ) {
      return "error";
    }
    return "active";
  }

  if (step === 1) {
    if (snap.lookupError && activeStep !== 1) return "error";
    return isStep1Complete(snap) ? "completed" : "empty";
  }
  if (step === 2) {
    if (snap.captureError && activeStep !== 2) return "error";
    return isStep2Complete(snap) ? "completed" : "empty";
  }
  return isStep3Complete(snap) ? "completed" : "empty";
}

export function getShareChecklist(snap: WizardSnapshot): ShareChecklistItem[] {
  const syncStatus = snap.syncStatus ?? "local_only";
  const syncBlocking = syncStatus === "failed" || syncStatus === "conflict" || syncStatus === "error";

  return [
    {
      id: "address",
      ok: hasAddress(snap.address),
      required: true,
    },
    {
      id: "viewingAt",
      ok: hasViewingAt(snap.viewingAt),
      required: true,
    },
    {
      id: "fieldContent",
      ok: hasFieldContent(snap),
      required: true,
    },
    {
      id: "syncOk",
      ok: !syncBlocking,
      required: syncBlocking,
    },
  ];
}

export function canGenerateShareCard(snap: WizardSnapshot): boolean {
  return getShareChecklist(snap).every((item) => !item.required || item.ok);
}

export function canEnterStep(target: WizardStep, snap: WizardSnapshot): boolean {
  if (target === 1) return true;
  // Step 2 and 3 only require setup complete so Step 3 checklist can show gaps.
  return isStep1Complete(snap);
}

export function toDatetimeLocalValue(iso: string): string {
  if (!iso.trim()) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDatetimeLocalValue(local: string): string {
  if (!local.trim()) return "";
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? local : date.toISOString();
}

/** Mirror wizard setup fields into propertyDraft for cloud sync without DB migration. */
export function mirrorSetupIntoPropertyDraft(
  propertyDraft: Record<string, unknown>,
  setup: {
    viewingAt: string;
    unitLabel: string;
    priceLabel: string;
    layoutLabel: string;
    listingUrl: string;
    setupNotes: string;
    areaLabel?: string;
    managementFeeLabel?: string;
  },
): Record<string, unknown> {
  return {
    ...propertyDraft,
    viewingAt: setup.viewingAt || null,
    unitLabel: setup.unitLabel || null,
    priceLabel: setup.priceLabel || null,
    layoutLabel: setup.layoutLabel || null,
    listingUrl: setup.listingUrl || null,
    setupNotes: setup.setupNotes || null,
    areaLabel: setup.areaLabel || null,
    managementFeeLabel: setup.managementFeeLabel || null,
  };
}
