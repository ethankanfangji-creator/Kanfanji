"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Camera, MapPin, Video } from "lucide-react";
import { ClientAuthBar } from "@/components/ClientAuthBar";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/components/I18nProvider";
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
  const [viewings, setViewings] = useState<Viewing[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/login";
        return;
      }
      setEmail(user.email ?? "");
      const { data, error: queryError } = await supabase
        .from("viewings")
        .select(
          "id, address, tags, market, questions, photo_urls, video_urls, created_at, updated_at",
        )
        .order("updated_at", { ascending: false });
      if (queryError) setError(queryError.message);
      setViewings((data ?? []) as Viewing[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen w-full flex justify-center bg-[#FDF6F0] text-[#1A1A1A]">
      <div className="w-full max-w-[420px] px-4 pt-6 pb-28">
        <div className="flex items-start justify-between mb-5">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-[12px] font-medium text-[#6B7280] mb-2"
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
            return (
              <Link
                key={viewing.id}
                href={`/viewings/${viewing.id}`}
                className="block bg-white rounded-[22px] border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden"
              >
                <div className="flex gap-3 p-3">
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
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
