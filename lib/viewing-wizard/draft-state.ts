import type { WizardStep } from "./readiness";

export type ViewingDraftFormState = {
  wizardStep: WizardStep;
  address: string;
  viewingAt: string;
  unitLabel: string;
  priceLabel: string;
  layoutLabel: string;
  areaLabel: string;
  managementFeeLabel: string;
  listingUrl: string;
  setupNotes: string;
};

export const initialViewingDraftFormState: ViewingDraftFormState = {
  wizardStep: 1,
  address: "",
  viewingAt: "",
  unitLabel: "",
  priceLabel: "",
  layoutLabel: "",
  areaLabel: "",
  managementFeeLabel: "",
  listingUrl: "",
  setupNotes: "",
};

export type ViewingDraftFormAction =
  | {
      type: "setField";
      field: Exclude<keyof ViewingDraftFormState, "wizardStep">;
      value: string;
    }
  | { type: "setStep"; value: WizardStep }
  | { type: "hydrate"; value: Partial<ViewingDraftFormState> }
  | { type: "reset" };

export function viewingDraftFormReducer(
  state: ViewingDraftFormState,
  action: ViewingDraftFormAction,
): ViewingDraftFormState {
  switch (action.type) {
    case "setField":
      return state[action.field] === action.value
        ? state
        : { ...state, [action.field]: action.value };
    case "setStep":
      return state.wizardStep === action.value
        ? state
        : { ...state, wizardStep: action.value };
    case "hydrate":
      return { ...state, ...action.value };
    case "reset":
      return initialViewingDraftFormState;
  }
}
