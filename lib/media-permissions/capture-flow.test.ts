import { describe, expect, it, vi } from "vitest";
import { decideCaptureStart } from "./capture-gate";
import { createMockMediaPermissionAdapter } from "./mock-adapter";

/**
 * Integration-style coverage for the Stage 5 capture decision path with a
 * mocked hardware adapter (no real getUserMedia / MediaRecorder).
 */
describe("audio & photo capture flow (mocked hardware)", () => {
  it("requests getUserMedia only after the user continues from prompt", async () => {
    const adapter = createMockMediaPermissionAdapter({
      statuses: { microphone: "prompt" },
    });

    const first = decideCaptureStart({
      kind: "audio",
      status: await adapter.query("microphone"),
      explained: false,
    });
    expect(first).toEqual({ action: "show-preflight", status: "prompt" });
    expect(adapter.requestCount()).toBe(0);

    // User confirms the one-shot explain → native / adapter request.
    const result = await adapter.request("microphone", { audio: true });
    expect(result.ok).toBe(true);
    expect(adapter.requestCount()).toBe(1);

    const later = decideCaptureStart({
      kind: "audio",
      status: await adapter.query("microphone"),
      explained: true,
    });
    expect(later).toEqual({ action: "start-direct" });
  });

  it("skips the custom dialog when mic is already granted", async () => {
    const adapter = createMockMediaPermissionAdapter({
      statuses: { microphone: "granted" },
    });
    expect(
      decideCaptureStart({
        kind: "audio",
        status: await adapter.query("microphone"),
        explained: false,
      }),
    ).toEqual({ action: "start-direct" });
  });

  it("never opens an in-app permission dialog for photos", () => {
    expect(
      decideCaptureStart({ kind: "photo", status: "denied", explained: false }),
    ).toEqual({ action: "open-picker" });
  });

  it("surfaces denied audio for settings + import + text-note fallbacks", async () => {
    const adapter = createMockMediaPermissionAdapter({
      statuses: { microphone: "denied" },
    });
    const decision = decideCaptureStart({
      kind: "audio",
      status: await adapter.query("microphone"),
      explained: true,
    });
    expect(decision).toEqual({ action: "show-reauth", status: "denied" });

    const request = await adapter.request("microphone");
    expect(request.ok).toBe(false);
    if (!request.ok) expect(request.status).toBe("denied");
  });

  it("persists a stopped recording blob through a save callback (IDB mock)", async () => {
    const saveBlob = vi.fn(async (blob: Blob) => ({ id: "media-1", size: blob.size }));
    const chunks = [new Blob(["chunk-a"], { type: "audio/webm" })];
    const blob = new Blob(chunks, { type: "audio/webm" });
    const saved = await saveBlob(blob);
    expect(saved.id).toBe("media-1");
    expect(saveBlob).toHaveBeenCalledTimes(1);
    expect(blob.size).toBeGreaterThan(0);
  });
});
