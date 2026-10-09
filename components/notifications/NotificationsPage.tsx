"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { PageContainer } from "@/components/ui/primitives";
import type { NotificationItem } from "@/lib/notifications/types";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export function NotificationsPage() {
  const { messages } = useI18n();
  const configured = isSupabaseConfigured();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(configured ? null : false);

  useEffect(() => {
    if (!configured) return;
    const supabase = getSupabase();
    if (!supabase) {
      queueMicrotask(() => {
        setSignedIn(false);
        setLoading(false);
      });
      return;
    }
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const next = Boolean(data.user);
      setSignedIn(next);
      if (!next) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [configured]);

  useEffect(() => {
    if (signedIn !== true) return;
    let cancelled = false;
    void fetch("/api/notifications?limit=50", { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error("load");
        return (await res.json()) as { items: NotificationItem[] };
      })
      .then((data) => {
        if (cancelled) return;
        setItems(data.items ?? []);
        setError(false);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  async function markAllRead() {
    try {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ all: true }),
      });
      if (!res.ok) return;
      setItems((prev) =>
        prev.map((item) =>
          item.readAt ? item : { ...item, readAt: new Date().toISOString() },
        ),
      );
    } catch {
      /* ignore */
    }
  }

  return (
    <PageContainer
      width="narrow"
      className="min-h-screen bg-[var(--color-canvas)] py-6"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold text-[#6B7280]">
            <Link href="/" className="hover:underline">
              {messages.brand.name}
            </Link>
          </p>
          <h1 className="text-[22px] font-bold text-[#111827]">
            {messages.notifications.title}
          </h1>
        </div>
        {signedIn && items.some((item) => !item.readAt) ? (
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="text-[12px] font-bold text-[#92400E] hover:underline"
          >
            {messages.notifications.markAllRead}
          </button>
        ) : null}
      </div>

      {signedIn === false ? (
        <p className="text-[14px] text-[#374151]">
          <Link href="/login" className="font-bold underline">
            {messages.nav.signIn}
          </Link>
        </p>
      ) : loading || signedIn === null ? (
        <p className="text-[13px] text-[#6B7280]" role="status">
          …
        </p>
      ) : error ? (
        <p className="text-[13px] text-[#991B1B]" role="alert">
          {messages.notifications.loadFailed}
        </p>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-[#6B7280]">{messages.notifications.empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className={`rounded-2xl border border-black/8 bg-white px-4 py-3 ${
                item.readAt ? "opacity-70" : ""
              }`}
            >
              {item.href ? (
                <Link href={item.href} className="block">
                  <p className="text-[14px] font-bold text-[#111827]">{item.title}</p>
                  <p className="mt-1 text-[13px] text-[#6B7280]">{item.body}</p>
                </Link>
              ) : (
                <>
                  <p className="text-[14px] font-bold text-[#111827]">{item.title}</p>
                  <p className="mt-1 text-[13px] text-[#6B7280]">{item.body}</p>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
