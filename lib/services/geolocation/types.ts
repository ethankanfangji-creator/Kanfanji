/**
 * Device geolocation. Browser adapter wraps navigator.geolocation.
 * UI should depend on this interface — never call navigator directly in feature UI.
 * ClientPage uses createBrowserGeolocationService().
 */

export type GeolocationFailureCode =
  | "denied"
  | "unavailable"
  | "unsupported"
  | "timeout"
  | "cancelled";

export type GeolocationPositionResult =
  | { ok: true; lat: number; lng: number; accuracy?: number }
  | { ok: false; code: GeolocationFailureCode; message?: string };

export type GeolocationService = {
  isSupported(): boolean;
  getCurrentPosition(options?: {
    signal?: AbortSignal;
    timeoutMs?: number;
    enableHighAccuracy?: boolean;
  }): Promise<GeolocationPositionResult>;
};

export function createMockGeolocationService(
  result: GeolocationPositionResult,
): GeolocationService {
  return {
    isSupported: () => result.ok || result.code !== "unsupported",
    async getCurrentPosition(options) {
      if (options?.signal?.aborted) {
        return { ok: false, code: "cancelled" };
      }
      return result;
    },
  };
}

export function mapBrowserGeolocationError(error: GeolocationPositionError): GeolocationFailureCode {
  if (error.code === error.PERMISSION_DENIED) return "denied";
  if (error.code === error.TIMEOUT) return "timeout";
  return "unavailable";
}
