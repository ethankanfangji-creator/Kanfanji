"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Camera, Check, GitCompare, MapPin, Video } from "lucide-react";
import { ClientAuthBar } from "@/components/ClientAuthBar";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/components/I18nProvider";
import { PageContainer } from "@/components/ui/primitives";
import {
  buildComparisonDraft,
  COMPARE_MAX,
  COMPARE_MIN,
  putComparison,
} from "@/lib/comparison";
import { createClient } from "@/utils/supabase/client";
import type { Viewing } from "@/lib/types";

function formatWhen(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-CA" : locale === "th" ? "th-TH" : "zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function ViewingsPage() {
  const { locale, messages } = useI18n();
  const router = useRouter();
  const [viewings, setViewings] = useState<Viewing[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [compareBusy, setCompareBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      setEmail(user.email ?? "");
      const response = await fetch("/api/viewings");
      const body = (await response.json()) as {
        viewings?: Viewing[];
        error?: string;
      };
      if (!response.ok) setError(body.error || "讀取案件失敗");
      setViewings(body.viewings ?? []);
      setLoading(false);
    })();
  }, [router]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= COMPARE_MAX) return prev;
      return [...prev, id];
    });
  }

  async function startCompare() {
    if (selected.length < COMPARE_MIN || selected.length > COMPARE_MAX) {
      setError(messages.compare.selectRange);
      return;
    }
    setError("");
    setCompareBusy(true);
    try {
      const picked = selected
        .map((id) => viewings.find((v) => v.id === id))
        .filter((v): v is Viewing => Boolean(v));
      const draft = buildComparisonDraft(
        picked.map((v) => ({
          id: v.id,
          address: v.address,
          updated_at: v.updated_at,
          pros: v.pros,
          risks: v.risks,
          questions: v.questions,
          property: v.property ?? {},
        })),
      );
      await putComparison(draft);
      router.push(`/compare/${draft.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.compare.error);
    } finally {
      setCompareBusy(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex justify-center bg-[var(--color-canvas)] text-[var(--color-text)]">
      <PageContainer narrow className="pt-6 pb-28">
        <div className="flex items-start justify-between mb-5">
          <div>
            <Link
              href="/"
              className="inline-flex min-h-[var(--touch-target)] items-center gap-1 text-[var(--font-size-xs)] font-medium text-[var(--color-text-muted)] mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> {messages.viewings.back}
            </Link>
            <h1 className="text-[20px] font-[800] tracking-tight leading-[1.1]">
              {messages.viewings.title}
              <br />
              <span className="text-[11px] font-[700] tracking-[0.18em] opacity-60">
                VIEWINGS · {email}
              </span>
            </h1>
          </div>
          <div className="mt-1.5 flex flex-col items-end gap-2">
            <LanguageSwitcher />
            <ClientAuthBar />
          </div>
        </div>

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectMode((v) => !v);
              setSelected([]);
            }}
            className="h-9 px-3 rounded-full bg-white border border-black/10 text-[11px] font-bold inline-flex items-center gap-1.5"
          >
            <GitCompare className="w-3.5 h-3.5" />
            {selectMode ? messages.compare.cancelSelect : messages.compare.selectMode}
          </button>
          {selectMode ? (
            <button
              type="button"
              disabled={
                compareBusy || selected.length < COMPARE_MIN || selected.length > COMPARE_MAX
              }
              onClick={() => void startCompare()}
              className="h-9 px-3 rounded-full bg-black text-white text-[11px] font-bold disabled:opacity-40"
            >
              {messages.compare.startCompare} ({selected.length})
            </button>
          ) : null}
        </div>
        {selectMode ? (
          <p className="mb-3 text-[12px] text-[#6B7280]">{messages.compare.selectHint}</p>
        ) : null}

        {error && (
          <div className="rounded-[18px] bg-[#FEF2F2] border border-[#FECACA] p-4 mb-4 text-[13px] text-[#991B1B]">
            {error}
          </div>
        )}

        {!loading && !error && viewings.length === 0 && (
          <div className="rounded-[22px] bg-white border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-6 text-center">
            <p className="text-[15px] font-bold">{messages.viewings.empty}</p>
            <Link
              href="/"
              className="inline-flex mt-4 h-10 px-4 rounded-full bg-black text-white text-[13px] font-bold items-center"
            >
              {messages.brand.name}
            </Link>
          </div>
        )}

        <div className="space-y-3">
          {viewings.map((viewing) => {
            const cover = viewing.photo_urls[0];
            const photoCount = viewing.photo_urls?.length ?? 0;
            const videoCount = viewing.video_urls?.length ?? 0;
            const isSelected = selected.includes(viewing.id);
            const body = (
              <div className="flex gap-3 p-3">
                {selectMode ? (
                  <div
                    className={`mt-1 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                      isSelected ? "bg-black border-black text-white" : "border-black/20 bg-white"
                    }`}
                  >
                    {isSelected ? <Check className="w-3.5 h-3.5" /> : null}
                  </div>
                ) : null}
                <div className="w-[72px] h-[72px] rounded-xl overflow-hidden bg-[#F5F3F0] shrink-0">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cover}
                      alt={viewing.address}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-[#9CA3AF]" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold leading-[1.3] line-clamp-2">
                    {viewing.address}
                  </p>
                  <p className="text-[11px] text-[#8A8A8A] mt-1">
                    {formatWhen(viewing.updated_at, locale)}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-[#6B7280]">
                    <span className="inline-flex items-center gap-1">
                      <Camera className="w-3 h-3" /> {photoCount}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Video className="w-3 h-3" /> {videoCount}
                    </span>
                  </div>
                </div>
              </div>
            );

            if (selectMode) {
              return (
                <button
                  key={viewing.id}
                  type="button"
                  onClick={() => toggleSelect(viewing.id)}
                  className={`w-full text-left bg-white rounded-[22px] border shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden ${
                    isSelected ? "border-black" : "border-black/[0.05]"
                  }`}
                >
                  {body}
                </button>
              );
            }

            return (
              <Link
                key={viewing.id}
                href={`/viewings/${viewing.id}`}
                className="block bg-white rounded-[22px] border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden"
              >
                {body}
              </Link>
            );
          })}
        </div>
      </PageContainer>
    </div>
  );
}
