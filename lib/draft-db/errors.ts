export type DraftDbErrorCode =
  | "not_found"
  | "invalid_input"
  | "immutable_id"
  | "lease_lost"
  | "transaction_failed"
  | "open_failed"
  | "unknown";

export class DraftDbError extends Error {
  readonly code: DraftDbErrorCode;
  readonly cause?: unknown;

  constructor(message: string, code: DraftDbErrorCode = "unknown", cause?: unknown) {
    super(message);
    this.name = "DraftDbError";
    this.code = code;
    this.cause = cause;
  }
}

export function wrapDraftDbError(operation: string, error: unknown): DraftDbError {
  if (error instanceof DraftDbError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new DraftDbError(`${operation} failed: ${message}`, "transaction_failed", error);
}
