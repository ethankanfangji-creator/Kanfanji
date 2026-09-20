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
    transit?: string;
    schools?: string;
    market?: string;
    streetViewNotice?: string;
    unitLevelNotice?: string;
  };
}) {
  const year = intel.basic.year != null ? String(intel.basic.year) : labels.unknown;
  const type = intel.basic.type || labels.unknown;
  const sold = intel.history.last_sold || labels.unknown;
  const strata = intel.history.strata || labels.unknown;
  const transit =
    intel.location.skytrain || intel.location.bus || labels.unknown;
  const schools =
    intel.location.schools.length > 0
      ? intel.location.schools.slice(0, 2).join("、")
      : labels.unknown;
  const marketHint =
    intel.market.avgUnitPrice ||
    intel.market.priceRange ||
    intel.neighborhood.builder ||
    null;
  const notices = [
    intel.compliance.streetViewNotice && labels.streetViewNotice
      ? labels.streetViewNotice
      : null,
    intel.compliance.unitLevelNotice && labels.unitLevelNotice
      ? labels.unitLevelNotice
      : null,
  ].filter(Boolean) as string[];

  return (
    <div className="border-b border-black/8 bg-white px-3 py-3">
      <p className="mb-2 text-[11px] font-bold tracking-[0.12em] text-[#6B7280]">
        {labels.title}
      </p>
      {intel.visuals.streetViewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={intel.visuals.streetViewUrl}
          alt=""
          className="mb-2.5 h-36 w-full rounded-2xl object-cover"
        />
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fact label={labels.year} value={year} />
        <Fact label={labels.type} value={type} />
        <Fact label={labels.sold} value={sold} />
        <Fact label={labels.strata} value={strata} />
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Fact label={labels.transit || "Transit"} value={transit} />
        <Fact label={labels.schools || "Schools"} value={schools} />
      </div>
      {marketHint ? (
        <p className="mt-2 text-[12px] text-[#374151]">
          <span className="font-bold text-[#6B7280]">
            {labels.market || "Market"} ·{" "}
          </span>
          {marketHint}
          {intel.neighborhood.name ? ` · ${intel.neighborhood.name}` : ""}
        </p>
      ) : null}
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
      {notices.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-[10px] leading-snug text-[#9CA3AF]">
          {notices.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      {intel.sources.length > 0 ? (
        <p className="mt-2 truncate text-[10px] text-[#9CA3AF]">
          {intel.sources.join(" · ")}
        </p>
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
