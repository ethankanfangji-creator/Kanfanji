import {
  DECISION_STATUSES,
  type DecisionStatus,
} from "./types";

export function isDecisionStatus(value: unknown): value is DecisionStatus {
  return typeof value === "string" && (DECISION_STATUSES as readonly string[]).includes(value);
}

/** Normalize chat_state / thread values; unknown → null. */
export function coerceDecisionStatus(value: unknown): DecisionStatus | null {
  if (value == null || value === "" || value === "none") return null;
  return isDecisionStatus(value) ? value : null;
}

export function toggleDecisionStatus(
  current: DecisionStatus | null,
  next: DecisionStatus,
): DecisionStatus | null {
  return current === next ? null : next;
}
