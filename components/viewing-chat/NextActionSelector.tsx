"use client";

import type { InitialPropertyReport } from "@/lib/property-source/initial-report-schema";

export function NextActionSelector({
  actions,
  onSelect,
}: {
  actions: InitialPropertyReport["nextActions"];
  onSelect?: (action: InitialPropertyReport["nextActions"][number]) => void;
}) {
  if (!actions.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={() => onSelect?.(action)}
          className="rounded-full border border-[#2563EB]/30 bg-[#EFF6FF] px-3 py-1.5 text-[12px] font-semibold text-[#1D4ED8]"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
