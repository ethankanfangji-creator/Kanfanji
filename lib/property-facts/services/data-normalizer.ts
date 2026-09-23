import type { Evidence } from "../types";
import type { DataNormalizer } from "../interfaces";

/**
 * Pass-through normalizer with light sanitization.
 * Does not invent values; drops empty string evidence values.
 */
export class DefaultDataNormalizer implements DataNormalizer {
  normalizeEvidence(evidence: Evidence<unknown>[]): Evidence<unknown>[] {
    return evidence.filter((e) => {
      if (e.value == null) return false;
      if (typeof e.value === "string" && !e.value.trim()) return false;
      return true;
    });
  }
}
