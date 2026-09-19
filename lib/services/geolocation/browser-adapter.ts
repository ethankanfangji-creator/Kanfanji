"use client";

import {
  createMockGeolocationService,
  mapBrowserGeolocationError,
  type GeolocationService,
  type GeolocationPositionResult,
} from "./types";

export function createBrowserGeolocationService(): GeolocationService {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return createMockGeolocationService({ ok: false, code: "unsupported" });
  }

  return {
    isSupported: () => true,
    getCurrentPosition(options) {
      return new Promise<GeolocationPositionResult>((resolve) => {
        if (options?.signal?.aborted) {
          resolve({ ok: false, code: "cancelled" });
          return;
        }

        const onAbort = () => resolve({ ok: false, code: "cancelled" });
        options?.signal?.addEventListener("abort", onAbort, { once: true });

        navigator.geolocation.getCurrentPosition(
          (position) => {
            options?.signal?.removeEventListener("abort", onAbort);
            resolve({
              ok: true,
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy: position.coords.accuracy,
            });
          },
          (error) => {
            options?.signal?.removeEventListener("abort", onAbort);
            resolve({
              ok: false,
              code: mapBrowserGeolocationError(error),
              message: error.message,
            });
          },
          {
            enableHighAccuracy: options?.enableHighAccuracy ?? true,
            timeout: options?.timeoutMs ?? 15_000,
            maximumAge: 60_000,
          },
        );
      });
    },
  };
}
