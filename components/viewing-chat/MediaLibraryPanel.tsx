"use client";

import { Database, FileIcon, ImageIcon, Music, Trash2, Video } from "lucide-react";
import { useEffect, useState } from "react";
import {
  formatBytes,
  listMediaLibrary,
  removeMediaFile,
  type MediaLibraryItem,
} from "@/lib/viewing-chat/media-library";
import { SheetCloseButton } from "@/components/viewing-chat/shell/SheetCloseButton";

export function MediaLibraryPanel({
  onClose,
  labels,
  railExpanded,
}: {
  onClose: () => void;
  labels: {
    title: string;
    hint: string;
    empty: string;
    close: string;
    delete: string;
    failed: string;
  };
  railExpanded?: boolean;
}) {
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const next = await listMediaLibrary();
      setItems(next);
    } catch {
      setError(labels.failed);
    }
  }

  useEffect(() => {
    void refresh();
    return () => {
      setItems((prev) => {
        for (const item of prev) {
          if (item.url) URL.revokeObjectURL(item.url);
        }
        return prev;
      });
    };
  }, []);

  async function onDelete(id: string) {
    setBusy(true);
    try {
      const target = items.find((i) => i.id === id);
      if (target?.url) URL.revokeObjectURL(target.url);
      await removeMediaFile(id);
      await refresh();
    } catch {
      setError(labels.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-stretch"
      role="dialog"
      aria-modal="true"
      aria-label={labels.title}
    >
      <button
        type="button"
        className="absolute inset-0"
        aria-label={labels.close}
        onClick={onClose}
      />
      <div
        className={`relative z-10 flex h-[90svh] w-full max-w-lg flex-col overflow-hidden rounded-t-[24px] border border-black/8 bg-white shadow-2xl md:ml-14 md:h-full md:max-h-none md:rounded-none md:border-0 ${
          railExpanded ? "md:ml-[240px]" : ""
        }`}
        style={{
          paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-black/15 md:hidden" aria-hidden />
        <div className="flex shrink-0 items-center gap-2 border-b border-black/8 px-4 py-3">
          <Database className="h-4 w-4 shrink-0 text-[#6B7280]" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold">{labels.title}</h2>
            <p className="text-[11px] text-[#6B7280]">{labels.hint}</p>
          </div>
          <SheetCloseButton label={labels.close} onClick={onClose} />
        </div>

        {error ? (
          <p className="shrink-0 border-b border-black/8 px-4 py-2 text-center text-[12px] font-semibold text-[#991B1B]">
            {error}
          </p>
        ) : null}

        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3">
          {items.length === 0 ? (
            <li className="px-2 py-10 text-center text-[13px] text-[#6B7280]">
              {labels.empty}
            </li>
          ) : (
            items.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-3 rounded-2xl border border-black/8 bg-[#FAF6F1] p-3"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
                  {item.kind === "image" && item.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt="" className="h-full w-full object-cover" />
                  ) : item.kind === "video" ? (
                    <Video className="h-5 w-5 text-[#6B7280]" />
                  ) : item.kind === "audio" ? (
                    <Music className="h-5 w-5 text-[#6B7280]" />
                  ) : item.kind === "image" ? (
                    <ImageIcon className="h-5 w-5 text-[#6B7280]" />
                  ) : (
                    <FileIcon className="h-5 w-5 text-[#6B7280]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold">{item.name}</p>
                  <p className="mt-0.5 text-[11px] text-[#6B7280]">
                    {formatBytes(item.size)} ·{" "}
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                  {item.sourceLabel ? (
                    <p className="mt-0.5 truncate text-[11px] text-[#9CA3AF]">
                      {item.sourceLabel}
                    </p>
                  ) : null}
                  {item.kind === "video" && item.url ? (
                    <video
                      src={item.url}
                      controls
                      className="mt-2 max-h-36 w-full rounded-lg"
                    />
                  ) : null}
                  {item.kind === "audio" && item.url ? (
                    <audio src={item.url} controls className="mt-2 w-full" />
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onDelete(item.id)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#991B1B] hover:bg-[#FEF2F2]"
                  aria-label={labels.delete}
                  title={labels.delete}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
