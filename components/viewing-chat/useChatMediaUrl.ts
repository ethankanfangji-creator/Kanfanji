"use client";

import { useEffect, useState } from "react";
import { getMediaBlob } from "@/lib/viewing-chat/media-library";
import type { ChatMediaRef } from "@/lib/viewing-chat/types";

type CachedUrl = { url: string; expiresAt: number };

const cache = new Map<string, CachedUrl>();

async function signPath(path: string): Promise<{ url: string; expiresIn: number } | null> {
  const response = await fetch("/api/media/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths: [path] }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { urls?: string[]; expiresIn?: number };
  const url = body.urls?.[0];
  if (!url) return null;
  return { url, expiresIn: body.expiresIn ?? 3600 };
}

async function resolveUrl(ref: ChatMediaRef): Promise<string | null> {
  const cached = cache.get(ref.id);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.url;
  const blob = await getMediaBlob(ref.id);
  if (blob) {
    const url = URL.createObjectURL(blob);
    cache.set(ref.id, { url, expiresAt: Number.POSITIVE_INFINITY });
    return url;
  }
  if (!ref.path) return null;
  const signed = await signPath(ref.path);
  if (!signed) return null;
  cache.set(ref.id, { url: signed.url, expiresAt: Date.now() + signed.expiresIn * 1000 });
  return signed.url;
}

export function useChatMediaUrl(ref: ChatMediaRef | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => {
    if (!ref) return null;
    const cached = cache.get(ref.id);
    return cached && cached.expiresAt > Date.now() + 30_000 ? cached.url : null;
  });

  useEffect(() => {
    if (!ref) return;
    let active = true;
    void resolveUrl(ref).then((next) => {
      if (active) setUrl(next);
    });
    return () => {
      active = false;
    };
  }, [ref]);

  return url;
}
