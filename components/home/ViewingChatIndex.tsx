"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { ClientAuthBar } from "@/components/ClientAuthBar";
import { useI18n } from "@/components/I18nProvider";
import { ViewingChatApp } from "@/components/viewing-chat/ViewingChatApp";
import { PageContainer } from "@/components/ui/primitives";
import { createClient } from "@/utils/supabase/client";

type ChatRow = {
  id: string;
  address: string;
  updatedAt: string;
};

function formatWhen(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-CA" : locale === "th" ? "th-TH" : "zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function ViewingChatIndex() {
  const { locale, messages } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const starting = searchParams.get("new") === "1";
  const legacyThread = searchParams.get("thread");
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!legacyThread || starting) return;
    router.replace(`/viewings/${legacyThread}`);
  }, [legacyThread, router, starting]);

  useEffect(() => {
    if (legacyThread && !starting) return;
    const supabase = createClient();
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        const next = starting ? "/?new=1" : "/";
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      if (starting) {
        setReady(true);
        return;
      }
      const response = await fetch("/api/viewing-chat/threads");
      const body = (await response.json().catch(() => ({}))) as {
        threads?: ChatRow[];
      };
      if (!response.ok) setError(messages.chat.syncRetry);
      const threads = [...(body.threads ?? [])].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      );
      setRows(threads);
      setReady(true);
    })();
  }, [legacyThread, messages.chat.syncRetry, router, starting]);

  if (legacyThread && !starting) return null;
  if (!ready) return null;

  if (starting) {
    return <ViewingChatApp startOnly />;
  }

  return (
    <div className="min-h-screen w-full flex justify-center bg-[var(--color-canvas)] text-[var(--color-text)]">
      <PageContainer narrow className="pt-6 pb-28">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-[800] tracking-tight">{messages.chat.historyTitle}</h1>
            <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">{messages.brand.subtitle}</p>
          </div>
          <ClientAuthBar />
        </div>

        <Link
          href="/?new=1"
          className="mb-4 inline-flex h-11 items-center rounded-full bg-black px-4 text-[13px] font-bold text-white"
        >
          {messages.chat.startNewViewing}
        </Link>

        {error ? (
          <div className="mb-4 rounded-[18px] border border-[#FECACA] bg-[#FEF2F2] p-4 text-[13px] text-[#991B1B]">
            {error}
          </div>
        ) : null}

        {!error && rows.length === 0 ? (
          <div className="rounded-[22px] border border-black/[0.05] bg-white p-6 text-center shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <p className="text-[15px] font-bold">{messages.chat.emptyHistory}</p>
          </div>
        ) : null}

        <div className="space-y-3">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/viewings/${row.id}`}
              className="block rounded-[22px] border border-black/[0.05] bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
            >
              <p className="flex items-start gap-2 text-[15px] font-bold leading-[1.35]">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#9CA3AF]" />
                <span>{row.address || "—"}</span>
              </p>
              <p className="mt-1 pl-6 text-[11px] text-[#8A8A8A]">{formatWhen(row.updatedAt, locale)}</p>
            </Link>
          ))}
        </div>
      </PageContainer>
    </div>
  );
}
