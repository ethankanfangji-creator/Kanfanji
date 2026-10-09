"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, LayoutList } from "lucide-react";
import {
  readBrowseLayout,
  writeBrowseLayout,
  type BrowseLayout,
} from "@/lib/browse-layout";

/**
 * Desktop-only list/grid toggle. Mobile always uses list via the caller's
 * effective layout (matchMedia / Tailwind). Preference is shared across
 * viewings + shares hub via localStorage.
 */
export function useBrowseLayout(): [BrowseLayout, (next: BrowseLayout) => void] {
  const [layout, setLayout] = useState<BrowseLayout>("grid");

  useEffect(() => {
    setLayout(readBrowseLayout());
  }, []);

  function update(next: BrowseLayout) {
    setLayout(next);
    writeBrowseLayout(next);
  }

  return [layout, update];
}

/** True when viewport is wide enough for grid cards (matches Tailwind `sm`). */
export function useBrowseLayoutWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return wide;
}

export function BrowseLayoutToggle({
  layout,
  onChange,
  labels,
}: {
  layout: BrowseLayout;
  onChange: (next: BrowseLayout) => void;
  labels: { list: string; grid: string };
}) {
  return (
    <div
      className="hidden shrink-0 items-center rounded-full border border-black/10 bg-white p-0.5 sm:inline-flex"
      role="group"
      aria-label={`${labels.list} / ${labels.grid}`}
    >
      <button
        type="button"
        aria-pressed={layout === "list"}
        aria-label={labels.list}
        title={labels.list}
        onClick={() => onChange("list")}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition ${
          layout === "list"
            ? "bg-[#1A1A1A] text-white"
            : "text-[#6B7280] hover:text-[#111]"
        }`}
      >
        <LayoutList className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        aria-pressed={layout === "grid"}
        aria-label={labels.grid}
        title={labels.grid}
        onClick={() => onChange("grid")}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition ${
          layout === "grid"
            ? "bg-[#1A1A1A] text-white"
            : "text-[#6B7280] hover:text-[#111]"
        }`}
      >
        <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

export function browseListClass(effective: BrowseLayout): string {
  return effective === "grid"
    ? "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
    : "grid grid-cols-1 gap-2";
}

export function browseCardClass(effective: BrowseLayout): string {
  const base =
    "flex h-full gap-3 rounded-2xl border border-black/[0.05] bg-white p-2.5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition hover:border-black/10 hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]";
  return effective === "grid"
    ? `${base} sm:flex-col sm:gap-2 sm:p-3`
    : base;
}

export function browseCoverClass(effective: BrowseLayout): string {
  return effective === "grid"
    ? "h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#F5F3F0] sm:aspect-[4/3] sm:h-auto sm:w-full"
    : "h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#F5F3F0]";
}
