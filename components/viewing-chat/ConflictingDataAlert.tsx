"use client";

import type { FieldConflict } from "@/lib/property-source/completeness";

export function ConflictingDataAlert({
  conflicts,
  title,
  cta,
  onConfirm,
}: {
  conflicts: FieldConflict[];
  title: string;
  cta: string;
  onConfirm?: () => void;
}) {
  if (!conflicts.length) return null;
  return (
    <div className="mx-3 mb-2 rounded-2xl border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2.5 text-[12px] text-[#991B1B]">
      <p className="font-bold">{title}</p>
      <ul className="mt-1 list-disc pl-4">
        {conflicts.map((c) => (
          <li key={c.path}>
            {c.path}: {c.values.map((v) => String(v.value)).join(" vs ")}
          </li>
        ))}
      </ul>
      {onConfirm ? (
        <button
          type="button"
          onClick={onConfirm}
          className="mt-2 rounded-full bg-[#991B1B] px-3 py-1 text-[11px] font-bold text-white"
        >
          {cta}
        </button>
      ) : null}
    </div>
  );
}
