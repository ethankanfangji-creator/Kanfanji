import { afterEach, describe, expect, it, vi } from "vitest";
import { canNativeShareUrl, shareOrCopyUrl } from "./share-or-copy";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubSecureWindow(secure = true) {
  vi.stubGlobal("window", { isSecureContext: secure });
}

describe("canNativeShareUrl", () => {
  it("is false without navigator.share", () => {
    stubSecureWindow(true);
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn() } });
    expect(canNativeShareUrl()).toBe(false);
  });

  it("is true when share exists and canShare allows url", () => {
    stubSecureWindow(true);
    vi.stubGlobal("navigator", {
      share: vi.fn(),
      canShare: vi.fn(() => true),
    });
    expect(canNativeShareUrl()).toBe(true);
  });

  it("is false outside a secure context", () => {
    stubSecureWindow(false);
    vi.stubGlobal("navigator", {
      share: vi.fn(),
      canShare: vi.fn(() => true),
    });
    expect(canNativeShareUrl()).toBe(false);
  });
});

describe("shareOrCopyUrl", () => {
  it("uses the system share sheet when available", async () => {
    stubSecureWindow(true);
    const share = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", {
      share,
      canShare: () => true,
      clipboard: { writeText: vi.fn() },
    });
    await expect(
      shareOrCopyUrl({ url: "https://example.com/s/a", title: "Report" }),
    ).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({
      url: "https://example.com/s/a",
      title: "Report",
    });
  });

  it("returns cancelled when the user dismisses the sheet", async () => {
    stubSecureWindow(true);
    vi.stubGlobal("navigator", {
      share: vi.fn(async () => {
        throw new DOMException("Share canceled", "AbortError");
      }),
      canShare: () => true,
      clipboard: { writeText: vi.fn() },
    });
    await expect(shareOrCopyUrl({ url: "https://example.com/s/a" })).resolves.toBe(
      "cancelled",
    );
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("falls back to clipboard when share is unavailable", async () => {
    stubSecureWindow(true);
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(shareOrCopyUrl({ url: "https://example.com/s/a" })).resolves.toBe(
      "copied",
    );
    expect(writeText).toHaveBeenCalledWith("https://example.com/s/a");
  });

  it("skips share and copies outside a secure context", async () => {
    stubSecureWindow(false);
    const share = vi.fn(async () => undefined);
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", {
      share,
      canShare: () => true,
      clipboard: { writeText },
    });
    // clipboard.writeText is gated on secure context; stub execCommand path
    const execCommand = vi.fn(() => true);
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    const input = {
      value: "",
      focus: vi.fn(),
      select: vi.fn(),
      setSelectionRange: vi.fn(),
      setAttribute: vi.fn(),
      style: {} as CSSStyleDeclaration,
    };
    vi.stubGlobal("document", {
      createElement: () => input,
      body: { appendChild, removeChild },
      execCommand,
    });
    await expect(shareOrCopyUrl({ url: "http://192.168.1.1/s/a" })).resolves.toBe(
      "copied",
    );
    expect(share).not.toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith("copy");
  });
});
