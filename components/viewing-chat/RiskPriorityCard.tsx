"use client";

import type { InitialPropertyReport } from "@/lib/property-source/initial-report-schema";

export function RiskPriorityCard({
  risks,
}: {
  risks: InitialPropertyReport["risks"];
}) {
  if (!risks.length) return null;
  const order = { high: 0, medium: 1, low: 2 } as const;
  const sorted = [...risks].sort((a, b) => order[a.priority] - order[b.priority]);
  return (
    <div className="space-y-2">
      <p className="text-[12px] font-bold">風險與待確認</p>
      {sorted.map((risk) => (
        <div
          key={risk.id}
          className={`rounded-xl border px-3 py-2 ${
            risk.priority === "high"
              ? "border-[#FECACA] bg-[#FEF2F2]"
              : risk.priority === "medium"
                ? "border-[#FDE68A] bg-[#FFFBEB]"
                : "border-[#E5E7EB] bg-[#F9FAFB]"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide opacity-70">
            {risk.priority}
          </p>
          <p className="font-semibold">{risk.description}</p>
          <p className="mt-0.5 text-[12px] text-[#4B5563]">{risk.rationale}</p>
          <p className="mt-1 text-[11px] text-[#6B7280]">
            驗證：{risk.howToVerify} · 詢問：{risk.askWhom}
          </p>
        </div>
      ))}
    </div>
  );
}
