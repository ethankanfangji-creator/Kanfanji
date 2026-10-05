"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { formatMessage } from "@/lib/i18n";
import type { NotificationItem } from "@/lib/notifications/types";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

type Props = {
  expanded: boolean;
  /** Compact rail button style when true (matches IconRail). */
  rail?: boolean;
};

async function fetchNotifications(): Promise<{
  items: NotificationItem[];
  unreadCount: number;
}> {
  const res = await fetch("/api/notifications?limit=20", {
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error("load");
  const data = (await res.json()) as {
    items: NotificationItem[];
    unreadCount: number;
  };
  return {
    items: data.items ?? [],
    unreadCount: data.unreadCount ?? 0,
  };
}

export function NotificationsBell({ expanded, rail = true }: Props) {
  const { messages } = useI18n();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const signedInRef = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = Boolean(session?.user);
      signedInRef.current = next;
      setSignedIn(next);
      if (!next) {
        setItems([]);
        setUnreadCount(0);
      }
    });
    void supabase.auth.getUser().then(({ data }) => {
      const next = Boolean(data.user);
      signedInRef.current = next;
      setSignedIn(next);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchNotifications();
        if (cancelled) return;
        setItems(data.items);
        setUnreadCount(data.unreadCount);
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    void load();
    const id = window.setInterval(() => {
      if (signedInRef.current) void load();
    }, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [signedIn]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetchNotifications()
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setUnreadCount(data.unreadCount);
        setError(false);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });

    function onDocClick(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => {
      cancelled = true;
      document.removeEventListener("mousedown", onDocClick);
    };
  }, [open]);

  async function markAllRead() {
    try {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ all: true }),
      });
      if (!res.ok) return;
      setUnreadCount(0);
      setItems((prev) =>
        prev.map((item) =>
          item.readAt ? item : { ...item, readAt: new Date().toISOString() },
        ),
      );
    } catch {
      /* ignore */
    }
  }

  async function markOneRead(id: string) {
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ids: [id] }),
      });
      setItems((prev) =>
        prev.map((item) =>
          item.id === id && !item.readAt
            ? { ...item, readAt: new Date().toISOString() }
            : item,
        ),
      );
      setUnreadCount((n) => Math.max(0, n - 1));
    } catch {
      /* ignore */
    }
  }

  if (!signedIn) return null;

  const label = messages.nav.notifications;
  const buttonClass = rail
    ? expanded
      ? "relative flex h-11 w-full items-center gap-3 rounded-2xl px-3 text-left text-[#374151] transition-colors hover:bg-black/5"
      : "relative flex h-11 w-11 items-center justify-center rounded-2xl text-[#374151] transition-colors hover:bg-black/5"
    : "relative flex min-h-[var(--touch-target)] w-full items-center gap-2 rounded-2xl px-3 text-left text-[13px] font-bold hover:bg-[#FAF6F1]";

  return (
    <div ref={rootRef} className={rail ? "relative" : ""}>
      <button
        type="button"
        className={buttonClass}
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => {
            const next = !v;
            if (next) setLoading(true);
            return next;
          });
        }}
      >
        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
          <Bell className="h-5 w-5" strokeWidth={2} />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#B45309] px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </span>
        {expanded || !rail ? (
          <span className="truncate text-[13px] font-bold">{label}</span>
        ) : null}
      </button>

      {open ? (
        <div
          className={`absolute z-50 w-[min(320px,calc(100vw-2rem))] rounded-2xl border border-black/10 bg-white p-2 shadow-lg ${
            rail
              ? expanded
                ? "left-0 top-[calc(100%+6px)]"
                : "left-[calc(100%+8px)] top-0"
              : "bottom-[calc(100%+6px)] left-0 right-0 w-full"
          }`}
          role="dialog"
          aria-label={messages.notifications.title}
        >
          <div className="mb-1 flex items-center justify-between gap-2 px-2 py-1">
            <p className="text-[12px] font-bold text-[#374151]">
              {messages.notifications.title}
            </p>
            {unreadCount > 0 ? (
              <button
                type="button"
                className="text-[11px] font-semibold text-[#92400E] hover:underline"
                onClick={() => void markAllRead()}
              >
                {messages.notifications.markAllRead}
              </button>
            ) : null}
          </div>
          {loading && items.length === 0 ? (
            <p className="px-2 py-3 text-[12px] text-[#6B7280]" role="status">
              …
            </p>
          ) : error ? (
            <p className="px-2 py-3 text-[12px] text-[#991B1B]" role="alert">
              {messages.notifications.loadFailed}
            </p>
          ) : items.length === 0 ? (
            <p className="px-2 py-3 text-[12px] text-[#6B7280]">
              {messages.notifications.empty}
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  {item.href ? (
                    <Link
                      href={item.href}
                      onClick={() => {
                        if (!item.readAt) void markOneRead(item.id);
                        setOpen(false);
                      }}
                      className={`block rounded-xl px-2 py-2 text-left hover:bg-[#FAF6F1] ${
                        item.readAt ? "opacity-70" : ""
                      }`}
                    >
                      <p className="text-[12px] font-bold text-[#111827]">{item.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-[#6B7280]">
                        {item.body}
                      </p>
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (!item.readAt) void markOneRead(item.id);
                      }}
                      className={`block w-full rounded-xl px-2 py-2 text-left hover:bg-[#FAF6F1] ${
                        item.readAt ? "opacity-70" : ""
                      }`}
                    >
                      <p className="text-[12px] font-bold text-[#111827]">{item.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-[#6B7280]">
                        {item.body}
                      </p>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1 border-t border-black/8 px-2 pt-2">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-[11px] font-bold text-[#374151] hover:underline"
            >
              {messages.notifications.title}
            </Link>
          </div>
          {unreadCount > 0 ? (
            <p className="sr-only">
              {formatMessage(messages.notifications.unreadBadge, {
                count: unreadCount,
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
