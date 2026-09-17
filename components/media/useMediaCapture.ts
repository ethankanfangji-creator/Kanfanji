"use client";

import { useMemo } from "react";
import { createBrowserMediaPermissionAdapter } from "@/lib/media-permissions";

export function selectSupportedAudioMimeType(
  isSupported: (mimeType: string) => boolean,
): string {
  return (
    ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(isSupported) ?? ""
  );
}

/**
 * Owns the stable browser permission adapter used by capture flows. Active
 * streams remain owned by the recorder so it can persist before releasing.
 */
export function useMediaCapture() {
  const adapter = useMemo(() => createBrowserMediaPermissionAdapter(), []);
  return { adapter };
}
