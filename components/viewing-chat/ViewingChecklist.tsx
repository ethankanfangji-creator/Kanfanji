"use client";

import type { InitialPropertyReport } from "@/lib/property-source/initial-report-schema";

export function ViewingChecklist({
  items,
}: {
  items: InitialPropertyReport["viewingChecklist"];
}) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-[12px] font-bold">看房檢查清單</p>
      <ul className="mt-1 space-y-1">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex gap-2 rounded-xl border border-black/8 px-3 py-2 text-[12px]"
          >
            <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border border-black/25" />
            <span>
              <span className="font-semibold">{item.label}</span>
              <span className="block text-[11px] text-[#6B7280]">
                {item.category} · {item.why}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
