"use client";

export function ConfidenceBadge({ score }: { score: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, score)) * 100);
  const tone =
    pct >= 70 ? "bg-[#DCFCE7] text-[#166534]" : pct >= 40 ? "bg-[#FEF9C3] text-[#854D0E]" : "bg-[#FEE2E2] text-[#991B1B]";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>
      {pct}%
    </span>
  );
}
