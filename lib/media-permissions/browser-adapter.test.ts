import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserMediaPermissionAdapter } from "./browser-adapter";

function mockPermissions(state: PermissionState) {
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: {
      query: vi.fn(async () => ({ state })),
    },
  });
}

function mockGetUserMedia(impl: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(impl),
    },
  });
}

beforeEach(() => {
  vi.stubGlobal(
    "MediaRecorder",
    class {
      static isTypeSupported() {
        return true;
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createBrowserMediaPermissionAdapter", () => {
  it("queries Permissions API and requests getUserMedia only on request()", async () => {
    mockPermissions("prompt");
    const stream = {
      getTracks: () => [],
    } as unknown as MediaStream;
    mockGetUserMedia(async () => stream);

    const adapter = createBrowserMediaPermissionAdapter();
    expect(await adapter.query("microphone")).toBe("prompt");
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();

    const result = await adapter.request("microphone", { audio: true });
    expect(result.ok).toBe(true);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: true,
    });
  });

  it("classifies NotAllowed after prior grant as permission-revoked", async () => {
    mockPermissions("granted");
    mockGetUserMedia(async () => {
      throw Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
    });

    const adapter = createBrowserMediaPermissionAdapter();
    const result = await adapter.request("microphone");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe("permission-revoked");
  });

  it("reports unsupported when mediaDevices is missing", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
    const adapter = createBrowserMediaPermissionAdapter();
    expect(adapter.isMediaDevicesSupported()).toBe(false);
    expect(await adapter.query("microphone")).toBe("unsupported");
  });
});
