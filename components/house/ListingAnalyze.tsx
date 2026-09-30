"use client";

import { FormEvent, useState } from "react";
import { isBlankListing, type ListingExtract } from "@/lib/listing-fields";

const cardClass =
  "rounded-2xl bg-white px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)]";

const FIELD_LABELS: Array<{ key: keyof Omit<ListingExtract, "photos">; label: string }> = [
  { key: "address", label: "地址" },
  { key: "price", label: "價格" },
  { key: "beds", label: "房" },
  { key: "baths", label: "衛" },
  { key: "sqft", label: "坪數" },
  { key: "year", label: "年份" },
  { key: "strata", label: "管理費" },
  { key: "type", label: "類型" },
];

export function ListingAnalyze({
  viewingId,
  initial,
}: {
  viewingId: string;
  initial: ListingExtract | null;
}) {
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [listing, setListing] = useState<ListingExtract | null>(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const body = new FormData();
    body.set("viewing_id", viewingId);
    if (file && url.trim()) {
      setError("請只貼連結，或只上傳一個 PDF／照片。");
      return;
    }
    if (file) body.set("file", file);
    else if (url.trim()) body.set("listing_url", url.trim());
    else {
      setError("請貼上連結，或上傳 PDF／照片。");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/extract-listing", { method: "POST", body });
      const payload = (await response.json()) as {
        error?: string;
        code?: string;
        listing?: ListingExtract;
      };
      if (response.status === 429 && payload.code === "ai_quota_exceeded") {
        setError("已達 AI 使用上限，請稍後再試。");
        return;
      }
      if (!response.ok || !payload.listing) {
        setError("分析失敗");
        return;
      }
      setListing(payload.listing);
    } catch {
      setError("分析失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className={`${cardClass} flex flex-col gap-3`} onSubmit={onSubmit}>
        <label className="flex flex-col gap-1 text-[12px] font-medium text-[#6B7280]">
          房源連結
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="貼上房源連結"
            inputMode="url"
            className="h-11 rounded-xl border border-black/10 px-3 text-[14px] text-[#1A1A1A]"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-medium text-[#6B7280]">
          PDF 或照片
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="text-[13px] text-[#1A1A1A]"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="h-11 rounded-full bg-black text-[14px] font-bold text-white disabled:opacity-40"
        >
          {busy ? "分析中" : "分析"}
        </button>
        {error ? <p className="text-[13px] text-[#991B1B]">{error}</p> : null}
      </form>
      {!listing || isBlankListing(listing) ? (
        <p className={`${cardClass} text-[15px] font-semibold`}>還沒有抽出欄位。</p>
      ) : null}
      {listing && !isBlankListing(listing) ? (
        <section className={cardClass} aria-label="抽出的欄位">
          <h2 className="text-[12px] font-medium text-[#6B7280]">抽出的欄位</h2>
          <dl className="mt-2 space-y-2">
            {FIELD_LABELS.map(({ key, label }) => {
              const value = listing[key];
              if (value == null || value === "") return null;
              return (
                <div key={key} className="flex gap-3 text-[14px]">
                  <dt className="w-14 shrink-0 text-[#6B7280]">{label}</dt>
                  <dd className="font-semibold">{value}</dd>
                </div>
              );
            })}
          </dl>
          {listing.photos.length > 0 ? (
            <ul className="mt-3 space-y-1">
              {listing.photos.map((photo) => (
                <li key={photo}>
                  <a href={photo} target="_blank" rel="noreferrer" className="text-[13px] underline">
                    照片
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
