"use client";

export type FieldDisplayStatus =
  | "confirmed"
  | "subjective"
  | "inferred"
  | "missing"
  | "skipped"
  | "conflict";

const TONE: Record<FieldDisplayStatus, string> = {
  confirmed: "bg-[#DCFCE7] text-[#166534]",
  subjective: "bg-[#E0E7FF] text-[#3730A3]",
  inferred: "bg-[#FEF9C3] text-[#854D0E]",
  missing: "bg-[#F3F4F6] text-[#6B7280]",
  skipped: "bg-[#EFF6FF] text-[#1E40AF]",
  conflict: "bg-[#FEE2E2] text-[#991B1B]",
};

export function FieldStatusBadge({
  status,
  labels,
}: {
  status: FieldDisplayStatus;
  labels: Record<FieldDisplayStatus, string>;
}) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${TONE[status]}`}
    >
      {labels[status]}
    </span>
  );
}
