export type { MediaPermissionAdapter, MediaPermissionName, MediaPermissionStatus, CaptureKind, MediaPermissionRequestResult, ClassifiedMediaError } from "./types";
export {
  classifyMediaError,
  mapPermissionState,
  isBlockingPermissionStatus,
  canPromptInPage,
} from "./classify";
export { createBrowserMediaPermissionAdapter } from "./browser-adapter";
export { createMockMediaPermissionAdapter } from "./mock-adapter";
export type { MockMediaPermissionState } from "./mock-adapter";
export {
  decideCaptureStart,
  hasCaptureExplained,
  markCaptureExplained,
  readCaptureExplained,
  resetCaptureExplainedForTests,
} from "./capture-gate";
export type { CaptureStartDecision, ExplainedCaptureKind } from "./capture-gate";
