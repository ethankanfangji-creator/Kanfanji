"use client";

import { useEffect, useState } from "react";
import { getMediaBlob } from "@/lib/viewing-chat/media-library";
import type { ChatMediaRef } from "@/lib/viewing-chat/types";

const cache = new Map<string, string>();

export function useChatMediaUrl(ref: ChatMediaRef | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(ref ? cache.get(ref.id) ?? null : null);

  useEffect(() => {
    if (!ref) return;
    const cached = cache.get(ref.id);
    if (cached) {
      setUrl(cached);
      return;
    }
    let revoked = "";
    let active = true;
    void getMediaBlob(ref.id).then((blob) => {
      if (!active || !blob) return;
      revoked = URL.createObjectURL(blob);
      cache.set(ref.id, revoked);
      setUrl(revoked);
    });
    return () => {
      active = false;
      if (revoked) {
        cache.delete(ref.id);
        URL.revokeObjectURL(revoked);
      }
    };
  }, [ref?.id]);

  return url;
}
