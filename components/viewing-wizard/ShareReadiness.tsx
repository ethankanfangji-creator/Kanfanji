"use client";

import type { ShareChecklistItem, ShareChecklistItemId } from "@/lib/viewing-wizard/readiness";
import { Check, X } from "lucide-react";

export function ShareReadinessList({
  items,
  labels,
  title,
}: {
  items: ShareChecklistItem[];
  labels: Record<ShareChecklistItemId, string>;
  title: string;
}) {
  return (
    <div className="rounded-[22px] bg-white border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-4 mb-4">
      <p className="text-[12px] font-[800] tracking-widest mb-3">{title}</p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-[13px] ${
              item.ok
                ? "bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]"
                : item.required
                  ? "bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]"
                  : "bg-[#F8F4EF] border-black/5 text-[#6B7280]"
            }`}
          >
            {item.ok ? (
              <Check className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <X className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <span className="font-medium leading-[1.35]">{labels[item.id]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
