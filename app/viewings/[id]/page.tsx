import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Camera, Check, MapPin, Video } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { CollaborationPanel } from "@/components/collaboration/CollaborationPanel";
import { ViewingCollaborativeEditor } from "@/components/collaboration/ViewingCollaborativeEditor";
import { getViewingRole } from "@/lib/collaboration/server";
import { signPathsWithClient } from "@/lib/viewing-sync";
import type { Viewing, ViewingAudioNote } from "@/lib/types";
import { createAdminClient } from "@/utils/supabase/admin";

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default async function ViewingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const role = await getViewingRole(id, user.id);
  if (!role) notFound();
  const admin = createAdminClient();
  const selectColumns: string =
    role === "viewer"
      ? "id, user_id, address, tags, market, questions, pros, risks, photo_urls, video_urls, property, revision, created_at, updated_at"
      : role === "owner"
        ? "id, user_id, address, tags, market, questions, notes, pros, risks, photo_urls, video_urls, audio_urls, share_token, property, revision, created_at, updated_at"
        : "id, user_id, address, tags, market, questions, notes, pros, risks, photo_urls, video_urls, audio_urls, property, revision, created_at, updated_at";
  let { data, error } = await admin
    .from("viewings")
    .select(selectColumns)
    .eq("id", id)
    .maybeSingle();

  if (error?.message?.includes("notes") || error?.message?.includes("pros") || error?.message?.includes("share_token")) {
    ({ data, error } = await admin
      .from("viewings")
      .select(
        "id, user_id, address, tags, market, questions, photo_urls, video_urls, property, revision, created_at, updated_at",
      )
      .eq("id", id)
      .maybeSingle());
  } else if (error?.message?.includes("property")) {
    ({ data, error } = await admin
      .from("viewings")
      .select(
        "id, user_id, address, tags, market, questions, photo_urls, video_urls, revision, created_at, updated_at",
      )
      .eq("id", id)
      .maybeSingle());
  }

  if (error) {
    return (
      <div className="min-h-screen w-full flex justify-center bg-[#FDF6F0] text-[#1A1A1A]">
        <div className="w-full max-w-[420px] px-4 pt-6">
          <Link
            href="/viewings"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-[#6B7280] mb-4"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> 回列表
          </Link>
          <div className="rounded-[18px] bg-[#FEF2F2] border border-[#FECACA] p-4 text-[13px] text-[#991B1B]">
            讀取失敗：{error.message}
          </div>
        </div>
      </div>
    );
  }

  if (!data) notFound();

  const rawViewing = data as unknown as Viewing;
  const [photoUrls, videoUrls] = await Promise.all([
    signPathsWithClient(supabase, rawViewing.photo_urls ?? []),
    signPathsWithClient(supabase, rawViewing.video_urls ?? []),
  ]);
  const viewing: Viewing = {
    ...rawViewing,
    photo_urls: photoUrls,
    video_urls: videoUrls,
    // Viewer never receives raw transcripts in the rendered RSC payload.
    notes: role === "viewer" ? [] : rawViewing.notes,
    audio_urls: [],
  };
  const questions = viewing.questions ?? [];
  const checked = questions.filter((q) => q.checked);
  const notes = (viewing.notes ?? []) as ViewingAudioNote[];
  const pros = viewing.pros ?? [];
  const risks = viewing.risks ?? [];
  const photos = viewing.photo_urls ?? [];
  const videos = viewing.video_urls ?? [];
  const property = (viewing.property ?? {}) as Record<string, unknown>;
  const openData = (property.openData ?? null) as Record<string, unknown> | null;
  const sharePath =
    role === "owner" && viewing.share_token ? `/s/${viewing.share_token}` : "";
  const propertyRows = [
    ["來源", property.source],
    ["城市", property.city],
    ["社區", property.neighborhood],
    ["類型", property.localityType],
    ["省/州", property.province],
    ["國家", property.country],
    ["郵遞區號", property.postalCode],
    ["匹配分數", property.score != null ? `${Math.round(Number(property.score))}%` : undefined],
    ["精度", property.matchPrecision],
    [
      "座標",
      property.lat != null && property.lng != null
        ? `${Number(property.lat).toFixed(5)}, ${Number(property.lng).toFixed(5)}`
        : undefined,
    ],
    ["MLS", property.mlsNote],
    ["Open Data 城市", openData?.city],
    ["Zoning", openData?.zoningCode],
    ["Zoning 說明", openData?.zoningLabel],
    ["PID", openData?.pid],
    ["Plan", openData?.planNumber],
    ["Lot", openData?.lotNumber],
    ["Legal", openData?.legalDescription],
    ["Open Data 來源", openData?.source],
  ].filter(([, value]) => value != null && String(value).length > 0) as [string, string][];

  return (
    <div className="min-h-screen w-full flex justify-center bg-[#FDF6F0] text-[#1A1A1A]">
      <div className="w-full max-w-[420px] px-4 pt-6 pb-28">
        <Link
          href="/viewings"
          className="inline-flex items-center gap-1 text-[12px] font-medium text-[#6B7280] mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> 回列表
        </Link>

        <div className="bg-[#111] text-white rounded-[24px] p-5 mb-4">
          <p className="text-[10px] tracking-[0.2em] opacity-60">
            KANFANGJI · VIEWING DETAIL
          </p>
          <h1 className="text-[18px] font-bold mt-2 leading-[1.25]">{viewing.address}</h1>
          <p className="text-[11px] opacity-60 mt-2">
            {formatWhen(viewing.updated_at)}
            {viewing.market ? ` · ${viewing.market}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(viewing.tags ?? []).map((tag) => (
              <span key={tag} className="px-2.5 py-1 rounded-full bg-white/10 text-[11px]">
                {tag}
              </span>
            ))}
          </div>
          {sharePath && (
            <Link
              href={sharePath}
              className="mt-3 inline-block text-[11px] text-white/80 underline underline-offset-2 break-all"
            >
              分享連結：{sharePath}
            </Link>
          )}
        </div>

        <ViewingCollaborativeEditor
          viewingId={viewing.id}
          role={role}
          initialRevision={viewing.revision ?? 1}
          initialAddress={viewing.address}
          initialPros={pros}
          initialRisks={risks}
        />

        <CollaborationPanel viewingId={viewing.id} />

        {(pros.length > 0 || risks.length > 0) && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-[22px] bg-[#F0FDF4] border border-[#BBF7D0] p-4">
              <p className="text-[11px] font-bold text-[#166534] mb-2">✓ 優點</p>
              <ul className="space-y-1.5 text-[12px] text-[#14532D]">
                {pros.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-[22px] bg-[#FEF2F2] border border-[#FECACA] p-4">
              <p className="text-[11px] font-bold text-[#991B1B] mb-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> 風險
              </p>
              <ul className="space-y-1.5 text-[12px] text-[#7F1D1D]">
                {risks.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {notes.length > 0 && (
          <div className="bg-white rounded-[22px] border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-4 mb-4">
            <span className="text-[12px] font-[800] tracking-widest">NOTES 錄音摘要</span>
            <div className="mt-3 space-y-2">
              {notes.map((note) => (
                <p key={note.id} className="text-[12px] leading-[1.5] text-[#374151]">
                  「{note.transcript}」
                </p>
              ))}
            </div>
          </div>
        )}

        {propertyRows.length > 0 && (
          <div className="bg-white rounded-[22px] border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-4 mb-4">
            <span className="text-[12px] font-[800] tracking-widest">PROPERTY 地址詳情</span>
            <dl className="mt-3 space-y-2">
              {propertyRows.map(([label, value]) => (
                <div key={label} className="flex gap-3 text-[12px]">
                  <dt className="w-16 shrink-0 text-[#9CA3AF]">{label}</dt>
                  <dd className="font-medium leading-[1.4]">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div className="bg-white rounded-[22px] border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-[800] tracking-widest">PHOTOS 現場照片</span>
            <span className="text-[11px] text-[#6B7280] inline-flex items-center gap-1">
              <Camera className="w-3.5 h-3.5" /> {photos.length}
            </span>
          </div>
          {photos.length === 0 ? (
            <p className="text-[12px] text-[#9CA3AF]">尚無照片</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {photos.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="aspect-[4/3] rounded-xl overflow-hidden bg-[#F5F3F0] border border-black/5"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-[22px] border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-[800] tracking-widest">VIDEOS 15秒影片</span>
            <span className="text-[11px] text-[#6B7280] inline-flex items-center gap-1">
              <Video className="w-3.5 h-3.5" /> {videos.length}
            </span>
          </div>
          {videos.length === 0 ? (
            <p className="text-[12px] text-[#9CA3AF]">尚無影片</p>
          ) : (
            <div className="space-y-3">
              {videos.map((url, index) => (
                <div
                  key={url}
                  className="rounded-xl overflow-hidden bg-black border border-black/5"
                >
                  <video
                    src={url}
                    controls
                    playsInline
                    className="w-full max-h-[240px] bg-black"
                  />
                  <p className="px-3 py-2 text-[11px] text-white/70">影片 {index + 1}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-[22px] border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-[800] tracking-widest">Q&A 問題清單</span>
            <span className="text-[11px] text-[#6B7280]">
              {checked.length}/{questions.length} 已勾
            </span>
          </div>
          {questions.length === 0 ? (
            <p className="text-[12px] text-[#9CA3AF]">尚無問題清單</p>
          ) : (
            <div className="space-y-2">
              {questions.map((q) => (
                <div
                  key={q.id}
                  className={`rounded-xl border p-3 ${
                    q.checked
                      ? "bg-[#FAF7F3] border-black/5"
                      : "bg-white border-dashed border-black/10"
                  }`}
                >
                  <p className="text-[12px] font-bold flex items-start gap-1.5">
                    {q.checked ? (
                      <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    ) : (
                      <span className="w-3.5 h-3.5 mt-0.5 shrink-0 rounded-full border border-black/20" />
                    )}
                    {q.text}
                  </p>
                  {q.answer && (
                    <p className="text-[11px] text-[#6B7280] mt-1.5 pl-5 leading-[1.45]">
                      A: {q.answer}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[18px] bg-[#F8F4EF] border border-black/5 p-3 flex items-start gap-2 text-[11px] text-[#6B7280]">
          <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <p>
            ID <span className="font-mono">{viewing.id.slice(0, 8)}</span> · 建立於{" "}
            {formatWhen(viewing.created_at)}
          </p>
        </div>
      </div>
    </div>
  );
}
