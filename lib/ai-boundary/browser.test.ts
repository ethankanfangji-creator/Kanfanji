import { afterEach, describe, expect, it, vi } from "vitest";
import { mapWithConcurrency, normalizeImageForAi, runIfAiConsented } from "./browser";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bounded browser image work", () => {
  it("makes zero AI calls after consent is declined", async () => {
    const request = vi.fn().mockResolvedValue(new Response());
    await expect(runIfAiConsented(false, request)).resolves.toEqual({ started: false });
    expect(request).not.toHaveBeenCalled();
  });

  it("never exceeds the requested concurrency and preserves order", async () => {
    let active = 0;
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return value * 2;
    });
    expect(peak).toBe(2);
    expect(results.map((result) => (result.status === "fulfilled" ? result.value : null))).toEqual([
      2, 4, 6, 8, 10,
    ]);
  });

  it("resizes to a derivative and always closes the bitmap", async () => {
    const close = vi.fn();
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob: (callback: (blob: Blob) => void) =>
        callback(new Blob(["small"], { type: "image/jpeg" })),
    };
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 4000, height: 2000, close }),
    );
    vi.stubGlobal("document", { createElement: () => canvas });

    const result = await normalizeImageForAi(new Blob(["original"], { type: "image/jpeg" }), {
      maxDimension: 1000,
    });
    expect(result.type).toBe("image/jpeg");
    expect(canvas.width).toBe(1000);
    expect(canvas.height).toBe(500);
    expect(drawImage).toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });
});
