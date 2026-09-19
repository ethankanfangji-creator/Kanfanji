import { describe, expect, it } from "vitest";
import { classifyMediaError, canPromptInPage, mapPermissionState } from "./classify";
import { createMockMediaPermissionAdapter } from "./mock-adapter";

describe("mapPermissionState", () => {
  it("maps Permissions API states", () => {
    expect(mapPermissionState("granted")).toBe("granted");
    expect(mapPermissionState("denied")).toBe("denied");
    expect(mapPermissionState("prompt")).toBe("prompt");
    expect(mapPermissionState(undefined)).toBe("prompt");
  });
});

describe("classifyMediaError", () => {
  it("classifies NotAllowed as denied, then blocked when prior denied", () => {
    const err = Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
    expect(classifyMediaError(err, { name: "microphone" }).status).toBe("denied");
    expect(classifyMediaError(err, { name: "microphone", prior: "denied" }).status).toBe(
      "blocked",
    );
  });

  it("classifies revoked when prior was granted", () => {
    const err = Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
    expect(classifyMediaError(err, { prior: "granted" }).status).toBe("permission-revoked");
  });

  it("classifies in-use and unsupported", () => {
    expect(
      classifyMediaError(Object.assign(new Error("busy"), { name: "NotReadableError" })).status,
    ).toBe("in-use");
    expect(
      classifyMediaError(Object.assign(new Error("none"), { name: "NotFoundError" })).status,
    ).toBe("unsupported");
  });
});

describe("canPromptInPage", () => {
  it("only allows granted/prompt", () => {
    expect(canPromptInPage("prompt")).toBe(true);
    expect(canPromptInPage("granted")).toBe(true);
    expect(canPromptInPage("denied")).toBe(false);
    expect(canPromptInPage("blocked")).toBe(false);
  });
});

describe("createMockMediaPermissionAdapter", () => {
  it("never touches hardware and can grant on request", async () => {
    const adapter = createMockMediaPermissionAdapter({
      statuses: { microphone: "prompt" },
    });
    expect(await adapter.query("microphone")).toBe("prompt");
    const result = await adapter.request("microphone");
    expect(result.ok).toBe(true);
    if (result.ok) {
      adapter.release(result.stream);
    }
    expect(adapter.requestCount()).toBe(1);
    expect(await adapter.query("microphone")).toBe("granted");
  });

  it("returns configured failure statuses", async () => {
    const adapter = createMockMediaPermissionAdapter({
      statuses: { camera: "blocked" },
    });
    const result = await adapter.request("camera");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe("blocked");
  });

  it("reports unsupported without media devices", async () => {
    const adapter = createMockMediaPermissionAdapter({ supported: false });
    expect(await adapter.query("microphone")).toBe("unsupported");
    const result = await adapter.request("microphone");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe("unsupported");
  });
});
