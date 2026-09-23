import type {
  ExtractedPropertyFact,
  MergePropertyFactsResult,
  PropertyCollectionRecord,
  PropertyFactEvidence,
  PropertyFieldId,
  PropertyFieldState,
} from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function evidenceId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function valuesEqual(
  a: string | number | boolean | null,
  b: string | number | boolean | null,
): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  return String(a).replace(/\s+/g, "") === String(b).replace(/\s+/g, "");
}

function toFieldState(
  fact: ExtractedPropertyFact,
  updatedAt: string,
  hasConflict = false,
): PropertyFieldState {
  return {
    fieldId: fact.fieldId,
    value: fact.value,
    status: fact.status,
    confidence: fact.confidence,
    sourceMessageId: fact.sourceMessageId,
    rawText: fact.rawText,
    updatedAt,
    hasConflict,
  };
}

function statementEvidence(
  fact: ExtractedPropertyFact,
  kind: PropertyFactEvidence["kind"],
  createdAt: string,
  extras?: Partial<PropertyFactEvidence>,
): PropertyFactEvidence {
  return {
    id: evidenceId(kind),
    fieldId: fact.fieldId,
    kind,
    value: fact.value,
    status: fact.status,
    confidence: fact.confidence,
    sourceMessageId: fact.sourceMessageId,
    rawText: fact.rawText,
    createdAt,
    ...extras,
  };
}

export type MergePropertyFactsInput = {
  existing: PropertyCollectionRecord;
  /** Prior evidence log (append-only across merges) */
  evidence?: PropertyFactEvidence[];
  incoming: ExtractedPropertyFact[];
  /** When extract intent is request_summary */
  mode?: PropertyCollectionRecord["mode"];
};

/**
 * Merge newly extracted facts into the collection record.
 * - Explicit corrections (`status: corrected`) win over prior values.
 * - Conflicting confirmed/stated values do NOT silently overwrite;
 *   a `conflict` evidence row is created and the field is flagged.
 */
export function mergePropertyFacts(
  existing: PropertyCollectionRecord,
  incoming: ExtractedPropertyFact[],
  options?: {
    evidence?: PropertyFactEvidence[];
    mode?: PropertyCollectionRecord["mode"];
  },
): MergePropertyFactsResult;
export function mergePropertyFacts(
  input: MergePropertyFactsInput,
): MergePropertyFactsResult;
export function mergePropertyFacts(
  existingOrInput: PropertyCollectionRecord | MergePropertyFactsInput,
  incoming?: ExtractedPropertyFact[],
  options?: {
    evidence?: PropertyFactEvidence[];
    mode?: PropertyCollectionRecord["mode"];
  },
): MergePropertyFactsResult {
  const isObjectForm =
    existingOrInput &&
    typeof existingOrInput === "object" &&
    "existing" in existingOrInput &&
    "incoming" in existingOrInput;

  const existing = isObjectForm
    ? (existingOrInput as MergePropertyFactsInput).existing
    : (existingOrInput as PropertyCollectionRecord);
  const incomingFacts = isObjectForm
    ? (existingOrInput as MergePropertyFactsInput).incoming
    : (incoming ?? []);
  const priorEvidence = isObjectForm
    ? (existingOrInput as MergePropertyFactsInput).evidence ?? []
    : (options?.evidence ?? []);
  const nextMode = isObjectForm
    ? (existingOrInput as MergePropertyFactsInput).mode
    : options?.mode;

  const createdAt = nowIso();
  const fields: PropertyCollectionRecord["fields"] = {
    ...existing.fields,
  };
  const newEvidence: PropertyFactEvidence[] = [];
  const conflicts: PropertyFactEvidence[] = [];

  for (const fact of incomingFacts) {
    const prev = fields[fact.fieldId];

    // Unknown / defer markers: set status without inventing a value
    if (fact.status === "unknown" && (fact.value === null || fact.value === "")) {
      fields[fact.fieldId] = toFieldState(
        {
          ...fact,
          value: prev?.value ?? null,
          status: "unknown",
        },
        createdAt,
        prev?.hasConflict,
      );
      newEvidence.push(
        statementEvidence(fact, "unknown", createdAt, {
          previousValue: prev?.value ?? null,
        }),
      );
      continue;
    }

    if (!prev || prev.value == null || prev.status === "unknown") {
      const status = fact.status === "corrected" ? "corrected" : fact.status;
      fields[fact.fieldId] = toFieldState({ ...fact, status }, createdAt);
      newEvidence.push(
        statementEvidence(
          { ...fact, status },
          fact.status === "inferred" ? "inference" : "statement",
          createdAt,
        ),
      );
      continue;
    }

    if (valuesEqual(prev.value, fact.value)) {
      // Reinforce / upgrade confidence; prefer confirmed over inferred
      const status =
        fact.status === "corrected"
          ? "corrected"
          : prev.status === "corrected"
            ? "corrected"
            : fact.status === "confirmed" || prev.status === "confirmed"
              ? "confirmed"
              : fact.status;
      fields[fact.fieldId] = toFieldState(
        {
          ...fact,
          status,
          confidence: Math.max(prev.confidence, fact.confidence),
          rawText: fact.rawText || prev.rawText,
        },
        createdAt,
        prev.hasConflict,
      );
      newEvidence.push(
        statementEvidence({ ...fact, status }, "statement", createdAt, {
          previousValue: prev.value,
        }),
      );
      continue;
    }

    // Explicit user correction wins
    if (fact.status === "corrected") {
      const correction = statementEvidence(fact, "correction", createdAt, {
        previousValue: prev.value,
        incomingValue: fact.value,
        note: "User correction takes precedence over prior value",
      });
      newEvidence.push(correction);
      conflicts.push(correction);
      fields[fact.fieldId] = toFieldState(
        { ...fact, status: "corrected" },
        createdAt,
        false,
      );
      continue;
    }

    // Inferred must not overwrite confirmed/corrected
    if (
      fact.status === "inferred" &&
      (prev.status === "confirmed" || prev.status === "corrected")
    ) {
      const conflict = statementEvidence(fact, "conflict", createdAt, {
        previousValue: prev.value,
        incomingValue: fact.value,
        status: "inferred",
        note: "Inferred value conflicts with confirmed field; kept existing",
      });
      newEvidence.push(conflict);
      conflicts.push(conflict);
      fields[fact.fieldId] = {
        ...prev,
        hasConflict: true,
        updatedAt: createdAt,
      };
      continue;
    }

    // Confirmed vs confirmed (or other) conflict — do not silent overwrite
    if (
      (prev.status === "confirmed" || prev.status === "corrected") &&
      fact.status === "confirmed"
    ) {
      const conflict = statementEvidence(fact, "conflict", createdAt, {
        previousValue: prev.value,
        incomingValue: fact.value,
        note: "Conflicting confirmed values; kept existing until user corrects",
      });
      newEvidence.push(conflict);
      conflicts.push(conflict);
      fields[fact.fieldId] = {
        ...prev,
        hasConflict: true,
        updatedAt: createdAt,
      };
      continue;
    }

    // Inferred replacing empty-ish / inferred: allow update but log conflict if different
    if (prev.status === "inferred" && fact.status === "inferred") {
      const conflict = statementEvidence(fact, "conflict", createdAt, {
        previousValue: prev.value,
        incomingValue: fact.value,
        note: "Conflicting inferred values",
      });
      newEvidence.push(conflict);
      conflicts.push(conflict);
      fields[fact.fieldId] = {
        ...prev,
        hasConflict: true,
        updatedAt: createdAt,
      };
      continue;
    }

    // Default: incoming confirmed upgrades inferred
    if (prev.status === "inferred" && fact.status === "confirmed") {
      fields[fact.fieldId] = toFieldState(fact, createdAt);
      newEvidence.push(
        statementEvidence(fact, "statement", createdAt, {
          previousValue: prev.value,
        }),
      );
      continue;
    }

    // Fallback conflict
    const conflict = statementEvidence(fact, "conflict", createdAt, {
      previousValue: prev.value,
      incomingValue: fact.value,
      note: "Value conflict; kept existing",
    });
    newEvidence.push(conflict);
    conflicts.push(conflict);
    fields[fact.fieldId] = {
      ...prev,
      hasConflict: true,
      updatedAt: createdAt,
    };
  }

  const addressValue = fields.address?.value;
  const record: PropertyCollectionRecord = {
    address:
      typeof addressValue === "string"
        ? addressValue
        : (existing.address ?? null),
    mode: nextMode ?? existing.mode,
    fields,
    updatedAt: createdAt,
  };

  return {
    record,
    evidence: [...priorEvidence, ...newEvidence],
    conflicts,
  };
}

export function createEmptyPropertyRecord(
  partial?: Partial<PropertyCollectionRecord>,
): PropertyCollectionRecord {
  return {
    address: partial?.address ?? null,
    mode: partial?.mode ?? "collecting",
    fields: partial?.fields ?? {},
    updatedAt: partial?.updatedAt ?? nowIso(),
  };
}

export function listFilledFieldIds(
  record: PropertyCollectionRecord,
): PropertyFieldId[] {
  return (Object.keys(record.fields) as PropertyFieldId[]).filter((id) => {
    const f = record.fields[id];
    if (!f) return false;
    if (f.status === "unknown") return false;
    return f.value !== null && f.value !== "";
  });
}
