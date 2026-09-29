"use client";

import { useSyncExternalStore } from "react";

function subscribe() {
  return () => undefined;
}

function formatLocal(iso: string, locale: string) {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "—";
  return new Date(parsed).toLocaleString(locale);
}

export function LocalTime({ iso, locale }: { iso: string | null | undefined; locale: string }) {
  const fallback = iso && !Number.isNaN(Date.parse(iso)) ? iso.slice(0, 10) : "—";
  const label = useSyncExternalStore(
    subscribe,
    () => (iso ? formatLocal(iso, locale) : "—"),
    () => fallback,
  );
  if (!iso) return <>—</>;
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {label}
    </time>
  );
}
