import type { DraftDatabase } from "./db";
import { DraftDbError, wrapDraftDbError } from "./errors";
import type { ListOptions } from "./types";

export function isActiveRecord(record: { deletedAt: string | null }): boolean {
  return record.deletedAt == null;
}

export function filterListed<T extends { deletedAt: string | null }>(
  rows: T[],
  options?: ListOptions,
): T[] {
  if (options?.includeDeleted) return rows;
  return rows.filter(isActiveRecord);
}

export async function withStoreError<T>(
  operation: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw wrapDraftDbError(operation, error);
  }
}

export function requireFound<T>(
  value: T | undefined,
  entity: string,
  id: string,
): T {
  if (value === undefined) {
    throw new DraftDbError(`${entity} not found: ${id}`, "not_found");
  }
  return value;
}

export type RepoContext = {
  db: DraftDatabase;
};
