import type { WizardStep } from "@/lib/viewing-wizard/readiness";

export type StepNavigationDecision =
  | { kind: "noop" }
  | { kind: "confirm-back-to-address" }
  | { kind: "confirm-high-priority" }
  | { kind: "proceed"; target: WizardStep };

/**
 * Decide whether step navigation needs a confirm dialog.
 * Actual `goToStep` side effects stay in the caller.
 */
export function decideStepNavigationRequest(input: {
  from: WizardStep;
  to: WizardStep;
  openHighPriorityCount: number;
}): StepNavigationDecision {
  if (input.to === input.from) return { kind: "noop" };

  if (input.to === 1 && input.from >= 2) {
    return { kind: "confirm-back-to-address" };
  }

  if (input.to === 3 && input.from === 2 && input.openHighPriorityCount > 0) {
    return { kind: "confirm-high-priority" };
  }

  return { kind: "proceed", target: input.to };
}
