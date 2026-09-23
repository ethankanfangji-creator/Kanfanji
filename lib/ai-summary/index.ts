export type {
  AiClaimItem,
  AiSourceRef,
  AiSourceKind,
  ConfidenceLevel,
  ProcessRecordingLegacyPayload,
  ValidationIssue,
  ValidationResult,
  ViewingAiSummary,
} from "./types";
export {
  activeClaims,
  claimsToLegacyStrings,
  extractJsonObject,
  isConfidenceLevel,
  newClaimId,
  normalizeClaimItem,
  softDeleteClaim,
  updateClaimText,
  validateAndNormalizeSummary,
} from "./normalize";
