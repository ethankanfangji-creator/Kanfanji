export type { AiService, AiServiceStatus, AiIntegrateInput, AiIntegrateResult } from "./ai/types";
export { createMockAiService, resolveAiServiceStatus } from "./ai/types";
export { createOpenAiService } from "./ai/openai-adapter";

export type { AddressService, AddressServiceStatus } from "./address/types";
export { createMockAddressService } from "./address/types";
export { createServerAddressService } from "./address/server-adapter";

export type {
  GeolocationService,
  GeolocationPositionResult,
  GeolocationFailureCode,
} from "./geolocation/types";
export {
  createMockGeolocationService,
  mapBrowserGeolocationError,
} from "./geolocation/types";
export { createBrowserGeolocationService } from "./geolocation/browser-adapter";

export type { MediaStorageService, MediaStorageStatus } from "./storage/types";
export { createMockMediaStorageService } from "./storage/types";

export type { ShareService, ShareServiceStatus } from "./share/types";
export { createMockShareService } from "./share/types";

export type {
  SpeechService,
  SpeechServiceStatus,
  SpeechTranscribeInput,
  SpeechTranscribeResult,
} from "./speech/types";
export { createMockSpeechService } from "./speech/types";
