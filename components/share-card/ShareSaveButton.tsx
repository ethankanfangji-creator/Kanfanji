"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";

export function ShareSaveButton({
  token,
  labels,
}: {
  token: string;
  labels: {
    save: string;
    saved: string;
    saving: string;
    signInToSave: string;
    failed: string;
  };
}) {
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [saved, setSaved] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoTried = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/share/public/${token}/save`, {
          cache: "no-store",
        });
        if (!response.ok) {
          if (!cancelled) setReady(true);
          return;
        }
        const data = (await response.json()) as {
          isOwner?: boolean;
          saved?: boolean;
          signedIn?: boolean;
        };
        if (cancelled) return;
        if (data.isOwner) {
          setHidden(true);
          setReady(true);
          return;
        }
        setSignedIn(Boolean(data.signedIn));
        setSaved(Boolean(data.saved));
        setReady(true);
      } catch {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!ready || hidden || saved || autoTried.current) return;
    if (typeof window === "undefined") return;
    const wantSave = new URLSearchParams(window.location.search).get("save") === "1";
    if (!wantSave) return;
    autoTried.current = true;
    if (!signedIn) {
      window.location.href = `/login?mode=signup&next=${encodeURIComponent(
        `/s/${token}?save=1`,
      )}`;
      return;
    }
    void runSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot after status load
  }, [ready, hidden, saved, signedIn, token]);

  async function runSave() {
    if (busy || saved) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/share/public/${token}/save`, {
        method: "POST",
      });
      if (response.status === 401) {
        window.location.href = `/login?mode=signup&next=${encodeURIComponent(
          `/s/${token}?save=1`,
        )}`;
        return;
      }
      if (response.status === 403) {
        setHidden(true);
        return;
      }
      if (!response.ok) {
        setError(labels.failed);
        return;
      }
      setSaved(true);
      setSignedIn(true);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (url.searchParams.has("save")) {
          url.searchParams.delete("save");
          window.history.replaceState({}, "", `${url.pathname}${url.search}`);
        }
      }
    } catch {
      setError(labels.failed);
    } finally {
      setBusy(false);
    }
  }

  function onClick() {
    if (saved || busy) return;
    if (!signedIn) {
      window.location.href = `/login?mode=signup&next=${encodeURIComponent(
        `/s/${token}?save=1`,
      )}`;
      return;
    }
    void runSave();
  }

  if (!ready || hidden) return null;

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={onClick}
        disabled={busy || saved}
        className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-[13px] font-bold transition ${
          saved
            ? "bg-emerald-50 text-emerald-800"
            : "bg-black text-white active:opacity-90 disabled:opacity-50"
        }`}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : saved ? (
          <BookmarkCheck className="h-4 w-4" aria-hidden />
        ) : (
          <Bookmark className="h-4 w-4" aria-hidden />
        )}
        {busy
          ? labels.saving
          : saved
            ? labels.saved
            : signedIn
              ? labels.save
              : labels.signInToSave}
      </button>
      {error ? (
        <p className="mt-2 text-center text-[12px] font-semibold text-[#991B1B]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
