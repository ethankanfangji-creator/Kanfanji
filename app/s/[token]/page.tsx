import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Camera, Check, MapPin, Video } from "lucide-react";
import { fetchViewingByShareToken, hydrateViewingMedia } from "@/lib/share";
import type { ViewingAudioNote, ViewingQuestion } from "@/lib/types";

export default async function ShareCardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const raw = await fetchViewingByShareToken(token);
  if (!raw) notFound();

  const viewing = await hydrateViewingMedia(raw);
  const questions = (viewing.questions ?? []) as ViewingQuestion[];
  const notes = (viewing.notes ?? []) as ViewingAudioNote[];
  const pros = viewing.pros?.length ? viewing.pros : [];
  const risks = viewing.risks?.length ? viewing.risks : [];
  const photos = viewing.photo_urls ?? [];
  const videos = viewing.video_urls ?? [];

  return (
    <div className="min-h-screen w-full flex justify-center bg-[#FDF6F0] text-[#1A1A1A]">
      <div className="w-full max-w-[420px] px-4 pt-6 pb-28">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[11px] font-[700] tracking-[0.18em] opacity-60">
            KANFANGJI · SHARED CARD
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-white border border-black/10 text-[11px] font-bold"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> 關閉／回首頁
          </Link>
        </div>

        <div className="bg-white rounded-[28px] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.12)] border border-black/[0.05]">
          <div className="bg-[#111] text-white p-5">
            <p className="text-[10px] tracking-[0.2em] opacity-60">看房記 · 分享卡片</p>
            <h1 className="text-[18px] font-bold mt-2 leading-[1.25]">{viewing.address}</h1>
            <div className="mt-3 flex flex-wrap gap-2">
              {(viewing.tags ?? []).map((tag) => (
                <span key={tag} className="px-2.5 py-1 rounded-full bg-white/10 text-[11px]">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="p-5 space-y-5">
            {(pros.length > 0 || risks.length > 0) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-[#F0FDF4] border border-[#BBF7D0] p-3">
                  <p className="text-[11px] font-bold text-[#166534] mb-2">✓ 優點</p>
                  <ul className="space-y-1.5 text-[12px] text-[#14532D] leading-[1.4]">
                    {pros.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] p-3">
                  <p className="text-[11px] font-bold text-[#991B1B] mb-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> 風險
                  </p>
                  <ul className="space-y-1.5 text-[12px] text-[#7F1D1D] leading-[1.4]">
                    {risks.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {notes.length > 0 && (
              <div>
                <p className="text-[12px] font-bold tracking-widest mb-2">NOTES 錄音摘要</p>
                <div className="space-y-2">
                  {notes.map((note) => (
                    <div
                      key={note.id}
                      className="rounded-xl bg-[#FAF7F3] border border-black/5 p-3 text-[12px] leading-[1.5]"
                    >
                      「{note.transcript}」
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-[12px] font-bold tracking-widest mb-2">Q&A</p>
              {questions.length === 0 ? (
                <p className="text-[12px] text-[#9CA3AF]">尚無問題清單</p>
              ) : (
                <div className="space-y-2">
                  {questions.map((q) => (
                    <div key={q.id} className="rounded-xl bg-[#FAF7F3] border border-black/5 p-3">
                      <p className="text-[12px] font-bold flex items-start gap-1.5">
                        {q.checked ? (
                          <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        ) : (
                          <span className="w-3.5 h-3.5 mt-0.5 shrink-0 rounded-full border border-black/20" />
                        )}
                        {q.text}
                      </p>
                      {q.answer && (
                        <p className="text-[11px] text-[#6B7280] mt-1.5 pl-5">A: {q.answer}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {photos.length > 0 && (
              <div>
                <p className="text-[12px] font-bold tracking-widest mb-2 flex items-center gap-1">
                  <Camera className="w-3.5 h-3.5" /> PHOTOS
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {photos.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={url}
                      src={url}
                      alt=""
                      className="aspect-[4/3] rounded-xl object-cover bg-[#F5F3F0] border border-black/5"
                    />
                  ))}
                </div>
              </div>
            )}

            {videos.length > 0 && (
              <div>
                <p className="text-[12px] font-bold tracking-widest mb-2 flex items-center gap-1">
                  <Video className="w-3.5 h-3.5" /> VIDEOS
                </p>
                <div className="space-y-3">
                  {videos.map((url) => (
                    <video
                      key={url}
                      src={url}
                      controls
                      playsInline
                      className="w-full max-h-[240px] rounded-xl bg-black"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-[18px] bg-[#F8F4EF] border border-black/5 p-3 flex items-start gap-2 text-[11px] text-[#6B7280]">
          <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <p>
            由看房記產生的分享連結。媒體為限時授權存取。
            <Link href="/" className="ml-1 font-bold text-[#1A1A1A] underline-offset-2 hover:underline">
              開啟 App
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
