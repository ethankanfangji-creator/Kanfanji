"use client";

import type { PropertyIntel } from "@/lib/property-intel/types";

export function PropertyIntelCard({
  intel,
  labels,
}: {
  intel: PropertyIntel;
  labels: {
    title: string;
    year: string;
    type: string;
    sold: string;
    strata: string;
    risks: string;
    unknown: string;
  };
}) {
  const year = intel.basic.year != null ? String(intel.basic.year) : labels.unknown;
  const type = intel.basic.type || labels.unknown;
  const sold = intel.history.last_sold || labels.unknown;
  const strata = intel.history.strata || labels.unknown;

  return (
    <div className="border-b border-black/8 bg-white px-3 py-3">
      <p className="mb-2 text-[11px] font-bold tracking-[0.12em] text-[#6B7280]">
        {labels.title}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fact label={labels.year} value={year} />
        <Fact label={labels.type} value={type} />
        <Fact label={labels.sold} value={sold} />
        <Fact label={labels.strata} value={strata} />
      </div>
      {intel.risks.length > 0 ? (
        <div className="mt-2.5">
          <p className="mb-1 text-[11px] font-bold text-[#991B1B]">{labels.risks}</p>
          <div className="flex flex-wrap gap-1.5">
            {intel.risks.map((risk) => (
              <span
                key={risk}
                className="rounded-full bg-[#FEF2F2] px-2.5 py-1 text-[11px] font-bold text-[#991B1B] ring-1 ring-[#FECACA]"
              >
                {risk}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#FAF6F1] px-2.5 py-2">
      <p className="text-[10px] font-bold text-[#6B7280]">{label}</p>
      <p className="mt-0.5 truncate text-[13px] font-bold text-[#1A1A1A]">{value}</p>
    </div>
  );
}
