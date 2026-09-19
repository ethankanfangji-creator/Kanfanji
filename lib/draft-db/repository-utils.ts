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

export function inAccountScope<T extends { accountScope?: string }>(
  rows: T[],
  accountScope: string,
): T[] {
  return rows.filter(
    (row) =>
      row.accountScope === accountScope ||
      (!row.accountScope && accountScope.startsWith("guest:")),
  );
}

export function isVisibleInScope(
  record: { accountScope?: string } | null | undefined,
  accountScope: string,
): boolean {
  return (
    Boolean(record) &&
    (record?.accountScope === accountScope ||
      (!record?.accountScope && accountScope.startsWith("guest:")))
  );
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
  accountScope: string;
};
