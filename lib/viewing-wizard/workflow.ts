/**
 * Product workflow lifecycle for a ViewingSession (orthogonal to syncStatus).
 * Additive — older rows without the field normalize to "draft".
 */

export const VIEWING_WORKFLOW_STATUSES = [
  "draft",
  "collecting",
  "ready_to_generate",
  "generating",
  "generated",
  "abandoned",
] as const;

export type ViewingWorkflowStatus = (typeof VIEWING_WORKFLOW_STATUSES)[number];

export function normalizeWorkflowStatus(value: unknown): ViewingWorkflowStatus {
  if (
    typeof value === "string" &&
    (VIEWING_WORKFLOW_STATUSES as readonly string[]).includes(value)
  ) {
    return value as ViewingWorkflowStatus;
  }
  return "draft";
}

export function isActiveWorkflow(status: ViewingWorkflowStatus): boolean {
  return (
    status === "draft" ||
    status === "collecting" ||
    status === "ready_to_generate" ||
    status === "generating" ||
    status === "generated"
  );
}

export function deriveWorkflowStatus(input: {
  current: ViewingWorkflowStatus;
  hasFieldContent: boolean;
  canGenerate: boolean;
  generating?: boolean;
  generated?: boolean;
}): ViewingWorkflowStatus {
  if (input.current === "abandoned") return "abandoned";
  if (input.generated) return "generated";
  if (input.generating) return "generating";
  if (input.canGenerate) return "ready_to_generate";
  if (input.hasFieldContent) return "collecting";
  return input.current === "draft" || input.current === "collecting"
    ? input.hasFieldContent
      ? "collecting"
      : "draft"
    : "draft";
}

/**
 * Prompt when confirming a different address against an existing in-progress viewing.
 * Does not run on each typed character — only when a confirmed next address is proposed.
 */
export function shouldPromptAddressSwitch(input: {
  localSessionId: string | null;
  workflowStatus: ViewingWorkflowStatus;
  committedAddress: string;
  nextAddress: string;
}): boolean {
  if (!input.localSessionId) return false;
  if (!isActiveWorkflow(input.workflowStatus)) return false;
  const committed = input.committedAddress.trim().toLowerCase();
  const next = input.nextAddress.trim().toLowerCase();
  if (!committed || !next) return false;
  return committed !== next;
}

export function addressesEquivalent(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
