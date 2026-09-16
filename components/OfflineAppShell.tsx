"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";

export function OfflineAppShell() {
  const { messages } = useI18n();
  // Keep the server and first client render identical; navigator.onLine is
  // only reliable after hydration.
  const [online, setOnline] = useState(true);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const refreshRequested = useRef(false);

  useEffect(() => {
    let active = true;
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    queueMicrotask(() => {
      if (active) setOnline(navigator.onLine);
    });

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
        if (registration.waiting) setWaiting(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              setWaiting(worker);
            }
          });
        });
      }).catch(() => undefined);
      const onControllerChange = () => {
        if (refreshRequested.current) window.location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
      return () => {
        active = false;
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
        navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      };
    }

    return () => {
      active = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (online && !waiting) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 top-3 z-[100] mx-auto flex min-h-11 max-w-[420px] items-center justify-between gap-3 rounded-2xl bg-[#111] px-4 py-2 text-[12px] font-bold text-white shadow-lg"
    >
      <span>{waiting ? messages.offline.updateReady : messages.offline.offline}</span>
      {waiting ? (
        <button
          type="button"
          className="min-h-11 shrink-0 rounded-full bg-white px-4 text-black"
          onClick={() => {
            refreshRequested.current = true;
            waiting.postMessage({ type: "SKIP_WAITING" });
          }}
        >
          {messages.offline.refresh}
        </button>
      ) : null}
    </div>
  );
}
