export class RequestValidationError extends Error {
  constructor(
    readonly code: string,
    readonly field?: string,
  ) {
    super(code);
    this.name = "RequestValidationError";
  }
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new RequestValidationError("INVALID_JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError("INVALID_JSON_OBJECT");
  }
  return value as Record<string, unknown>;
}

export function optionalString(
  object: Record<string, unknown>,
  field: string,
  options: { trim?: boolean; min?: number; max?: number; nullable?: boolean } = {},
): string | null | undefined {
  const value = object[field];
  if (value === undefined) return undefined;
  if (value === null && options.nullable) return null;
  if (typeof value !== "string") {
    throw new RequestValidationError("INVALID_FIELD_TYPE", field);
  }
  const normalized = options.trim === false ? value : value.trim();
  if (options.min !== undefined && normalized.length < options.min) {
    throw new RequestValidationError("FIELD_TOO_SHORT", field);
  }
  if (options.max !== undefined && normalized.length > options.max) {
    throw new RequestValidationError("FIELD_TOO_LONG", field);
  }
  return normalized;
}

export function optionalStringArray(
  object: Record<string, unknown>,
  field: string,
  options: { maxItems?: number; maxLength?: number } = {},
): string[] | undefined {
  const value = object[field];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new RequestValidationError("INVALID_FIELD_TYPE", field);
  }
  if (options.maxItems !== undefined && value.length > options.maxItems) {
    throw new RequestValidationError("TOO_MANY_ITEMS", field);
  }
  const normalized = value.map((item) => item.trim()).filter(Boolean);
  if (
    options.maxLength !== undefined &&
    normalized.some((item) => item.length > options.maxLength!)
  ) {
    throw new RequestValidationError("FIELD_TOO_LONG", field);
  }
  return normalized;
}

export function optionalObject(
  object: Record<string, unknown>,
  field: string,
): Record<string, unknown> | undefined {
  const value = object[field];
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError("INVALID_FIELD_TYPE", field);
  }
  return value as Record<string, unknown>;
}

export function optionalArray(
  object: Record<string, unknown>,
  field: string,
  options: { maxItems?: number } = {},
): unknown[] | undefined {
  const value = object[field];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new RequestValidationError("INVALID_FIELD_TYPE", field);
  }
  if (options.maxItems !== undefined && value.length > options.maxItems) {
    throw new RequestValidationError("TOO_MANY_ITEMS", field);
  }
  return value;
}

export function optionalEnum<const T extends readonly string[]>(
  object: Record<string, unknown>,
  field: string,
  values: T,
): T[number] | undefined {
  const value = object[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !values.includes(value)) {
    throw new RequestValidationError("INVALID_FIELD_VALUE", field);
  }
  return value as T[number];
}

export function assertAllowedKeys(
  object: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const allowedKeys = new Set(allowed);
  const unexpected = Object.keys(object).find((key) => !allowedKeys.has(key));
  if (unexpected) {
    throw new RequestValidationError("UNKNOWN_FIELD", unexpected);
  }
}

export function validationErrorBody(error: RequestValidationError) {
  return {
    error: error.code,
    ...(error.field ? { field: error.field } : {}),
  };
}
