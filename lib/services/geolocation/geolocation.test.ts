import { describe, expect, it } from "vitest";
import {
  createMockGeolocationService,
  mapBrowserGeolocationError,
} from "@/lib/services/geolocation/types";

describe("geolocation service", () => {
  it("reports GPS denial via mock adapter", async () => {
    const geo = createMockGeolocationService({ ok: false, code: "denied" });
    const result = await geo.getCurrentPosition();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("denied");
  });

  it("reports unsupported devices", async () => {
    const geo = createMockGeolocationService({ ok: false, code: "unsupported" });
    expect(geo.isSupported()).toBe(false);
    const result = await geo.getCurrentPosition();
    expect(result).toMatchObject({ ok: false, code: "unsupported" });
  });

  it("honours abort as cancelled", async () => {
    const geo = createMockGeolocationService({
      ok: true,
      lat: 49.2,
      lng: -122.9,
    });
    const controller = new AbortController();
    controller.abort();
    const result = await geo.getCurrentPosition({ signal: controller.signal });
    expect(result).toMatchObject({ ok: false, code: "cancelled" });
  });

  it("maps browser error codes", () => {
    const denied = {
      code: 1,
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
      message: "denied",
    } as GeolocationPositionError;
    expect(mapBrowserGeolocationError(denied)).toBe("denied");
  });
});
