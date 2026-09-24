export {
  AI_CONSENT_VERSION,
  AI_LIMITS,
  AI_LOCALES,
  AI_MARKETS,
  aiTimeoutMs,
} from "./config";
export {
  DEFAULT_AI_LOCALE,
  aiOutputLanguageInstruction,
  aiOutputLanguageName,
  aiWhisperLanguage,
  resolveAiLocale,
} from "./locale";
export {
  AiInputError,
  assertContentLength,
  validateIntegrateInputBody,
  validateRecordingForm,
  validateVisionBody,
} from "./validation";
export type {
  AiConsentAssertion,
  IntegrateInputBody,
  RecordingInput,
  VisionInput,
} from "./validation";
export {
  aiErrorUiCopyFromBoundary,
  mapAiErrorToUi,
} from "./map-ai-error-ui";
export type {
  AiErrorResponseLike,
  AiErrorUiCopy,
  AiErrorUiKind,
  AiErrorUiModel,
  AiUiAction,
} from "./map-ai-error-ui";
