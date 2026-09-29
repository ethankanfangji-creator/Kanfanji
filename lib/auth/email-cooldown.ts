"use client";

import { useEffect, useRef, useState } from "react";

const COOLDOWN_MS = 60_000;
const KEY_PREFIX = "kanfangji.authCooldown.";

export type CooldownPurpose = "signup" | "recovery";

const memoryUntil = new Map<string, number>();

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

function simpleHash(value: string): string {
  let left = 0x811c9dc5;
  let right = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    left ^= value.charCodeAt(index);
    left = Math.imul(left, 0x01000193);
    right ^= value.charCodeAt(value.length - 1 - index);
    right = Math.imul(right, 0x01000193);
  }
  return `${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0).toString(16).padStart(8, "0")}`;
}

/** First 16 hex characters. This only keeps the address out of localStorage. */
export async function emailCooldownHash(email: string): Promise<string> {
  const normalized = normalizedEmail(email);
  const subtle = globalThis.crypto?.subtle;
  if (subtle?.digest) {
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(normalized));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
  }
  return simpleHash(normalized);
}

export async function cooldownStorageKey(
  purpose: CooldownPurpose,
  email: string,
): Promise<string> {
  return `${KEY_PREFIX}${purpose}.${await emailCooldownHash(email)}`;
}

function parseUntil(raw: string | null): number | "missing" | "bad" {
  if (raw == null) return "missing";
  if (!/^\d+$/.test(raw)) return "bad";
  const value = Number(raw);
  return Number.isFinite(value) ? value : "bad";
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    const value = memoryUntil.get(key);
    return value == null ? null : String(value);
  }
}

function writeStored(key: string, until: number) {
  try {
    localStorage.setItem(key, String(until));
  } catch {
    memoryUntil.set(key, until);
  }
}

function deleteStored(key: string) {
  memoryUntil.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    // localStorage is unavailable; the memory entry is already cleared.
  }
}

function readUntil(key: string): number | null {
  const parsed = parseUntil(readStored(key));
  if (parsed === "missing") return null;
  if (parsed === "bad" || parsed <= Date.now()) {
    deleteStored(key);
    return null;
  }
  return parsed;
}

/** Drop expired or unreadable cooldown entries so they do not accumulate. */
export function sweepExpiredCooldowns(now = Date.now()) {
  try {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(KEY_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      const parsed = parseUntil(localStorage.getItem(key));
      if (parsed === "bad" || (typeof parsed === "number" && parsed <= now)) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    for (const [key, until] of memoryUntil) {
      if (until <= now) memoryUntil.delete(key);
    }
  }
}

export async function emailCooldownRemaining(
  purpose: CooldownPurpose,
  email: string,
): Promise<number> {
  const key = await cooldownStorageKey(purpose, email);
  const until = readUntil(key);
  if (until == null) return 0;
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

export async function startEmailCooldown(
  purpose: CooldownPurpose,
  email: string,
): Promise<number> {
  const until = Date.now() + COOLDOWN_MS;
  writeStored(await cooldownStorageKey(purpose, email), until);
  return until;
}

/** 60-second cooldown per purpose and email. Survives closing the app in localStorage. */
export function useEmailCooldown(purpose: CooldownPurpose, email: string) {
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [until, setUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    sweepExpiredCooldowns();
    void cooldownStorageKey(purpose, email).then((key) => {
      if (cancelled) return;
      setStorageKey(key);
      setUntil((current) => {
        const stored = readUntil(key);
        if (current != null && (stored == null || current >= stored)) return current;
        return stored;
      });
      setNow(Date.now());
    });
    return () => {
      cancelled = true;
    };
  }, [purpose, email]);

  useEffect(() => {
    if (!storageKey) return;
    function onStorage(event: StorageEvent) {
      if (event.key !== storageKey) return;
      const parsed = parseUntil(event.newValue);
      if (parsed === "missing" || parsed === "bad" || parsed <= Date.now()) {
        setUntil(null);
        return;
      }
      setUntil(parsed);
      setNow(Date.now());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey]);

  useEffect(() => {
    if (until == null) return;
    const id = window.setInterval(() => {
      const next = Date.now();
      if (next >= until) {
        if (storageKey) deleteStored(storageKey);
        setUntil(null);
        return;
      }
      setNow(next);
    }, 250);
    return () => window.clearInterval(id);
  }, [storageKey, until]);

  const remaining = until == null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));

  function start() {
    const nextUntil = Date.now() + COOLDOWN_MS;
    setUntil(nextUntil);
    setNow(Date.now());
    void cooldownStorageKey(purpose, email).then((key) => {
      if (!alive.current) return;
      writeStored(key, nextUntil);
      setStorageKey(key);
    });
  }

  return { remaining, cooling: remaining > 0, start };
}
