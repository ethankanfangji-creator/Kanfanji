export type ShareOrCopyResult = "shared" | "copied" | "cancelled" | "failed";

function isSecure(): boolean {
  return typeof window === "undefined" || window.isSecureContext;
}

/** Copy via hidden textarea — works outside secure contexts (LAN http). */
function copyWithExecCommand(url: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    const input = document.createElement("textarea");
    input.value = url;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    input.style.pointerEvents = "none";
    document.body.appendChild(input);
    input.focus();
    input.select();
    input.setSelectionRange(0, url.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(input);
    return ok;
  } catch {
    return false;
  }
}

async function copyToClipboard(url: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText && isSecure()) {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      // Fall through to execCommand.
    }
  }
  return copyWithExecCommand(url);
}

/** True when the Web Share API can present a system share sheet for a URL. */
export function canNativeShareUrl(): boolean {
  if (!isSecure()) return false;
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }
  if (typeof navigator.canShare !== "function") return true;
  try {
    return navigator.canShare({ url: "https://example.com/" });
  } catch {
    return true;
  }
}

/**
 * Prefer the system share sheet (LINE / Messages / …); fall back to clipboard.
 * User dismiss of the sheet returns `"cancelled"` without copying.
 * Outside a secure context, skips share and uses a clipboard fallback.
 */
export async function shareOrCopyUrl(input: {
  url: string;
  title?: string;
  text?: string;
  preferShare?: boolean;
}): Promise<ShareOrCopyResult> {
  const url = input.url.trim();
  if (!url) return "failed";

  const preferShare = input.preferShare !== false;
  if (
    preferShare &&
    isSecure() &&
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    let data: ShareData = { url };
    if (input.title) data.title = input.title;
    if (input.text) data.text = input.text;
    let allowed = true;
    if (typeof navigator.canShare === "function") {
      try {
        allowed = navigator.canShare(data);
      } catch {
        allowed = true;
      }
      // Some engines reject title+url; retry url-only before giving up on share.
      if (!allowed) {
        try {
          allowed = navigator.canShare({ url });
          if (allowed) data = { url };
        } catch {
          allowed = false;
        }
      }
    }
    if (allowed) {
      try {
        await navigator.share(data);
        return "shared";
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return "cancelled";
        }
        // Fall through to clipboard (e.g. share blocked after async work).
      }
    }
  }

  const copied = await copyToClipboard(url);
  return copied ? "copied" : "failed";
}
