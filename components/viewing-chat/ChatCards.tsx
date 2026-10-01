"use client";

import { useState } from "react";
import { loadChatCards } from "@/app/house/card-actions";
import { startViewingSession } from "@/app/house/session-actions";
import { TemplateWallet } from "@/components/house/TemplateWallet";
import type { CardTemplate } from "@/lib/viewing-card-templates";
import type { ViewingCardState } from "@/lib/viewing-card-record";

export function ChatCards({ viewingId }: { viewingId: string }) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<CardTemplate[] | null>(null);
  const [records, setRecords] = useState<ViewingCardState[]>([]);
  const [error, setError] = useState("");

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || templates) return;
    const result = await loadChatCards(viewingId);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setTemplates(result.templates);
    setRecords(result.records);
  }

  return (
    <div className="border-b border-black/8 bg-[#FAF6F1] px-3 py-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => void toggle()}
        className="h-9 rounded-full bg-white px-3 text-[12px] font-bold shadow-[0_4px_16px_rgba(0,0,0,0.06)]"
      >
        看房卡片
      </button>
      {open ? (
        <div className="mt-3 max-h-[50vh] overflow-y-auto">
          {error ? <p className="text-[13px] font-semibold text-[#991B1B]">{error}</p> : null}
          {templates ? (
            <div className="flex flex-col gap-3 pb-2">
              <form action={startViewingSession}>
                <input type="hidden" name="viewingId" value={viewingId} />
                <button
                  type="submit"
                  className="h-11 w-full rounded-full bg-black text-[14px] font-bold text-white"
                >
                  開始看房
                </button>
              </form>
              <TemplateWallet viewingId={viewingId} templates={templates} records={records} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
