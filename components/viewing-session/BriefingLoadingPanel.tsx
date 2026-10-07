"use client";

import { useEffect, useState } from "react";

/**
 * Rough briefing UX budget ~20s (facts + OpenAI web_search + structure).
 * Weighted to the real pipeline so we don't park on "writing" too early:
 * locate ~3s, search ~12s, write holds until the request finishes.
 */
export const BRIEFING_STAGE_DWELL_MS = [3_000, 12_000] as const;

type BriefingLoadingPanelProps = {
  ariaLabel: string;
  stages: [string, string, string];
};

export function BriefingLoadingPanel({
  ariaLabel,
  stages,
}: BriefingLoadingPanelProps) {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (stageIndex >= BRIEFING_STAGE_DWELL_MS.length) return;
    const dwell = BRIEFING_STAGE_DWELL_MS[stageIndex];
    const timer = window.setTimeout(() => {
      setStageIndex((prev) => Math.min(prev + 1, stages.length - 1));
    }, dwell);
    return () => window.clearTimeout(timer);
  }, [stageIndex, stages.length]);

  const activeStage = stages[Math.min(stageIndex, stages.length - 1)] ?? stages[0];

  return (
    <div
      className="mt-3 rounded-2xl bg-white px-4 py-3 shadow-[0_4px_16px_rgba(0,0,0,0.04)]"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={ariaLabel}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-black/15 border-t-[#1A1A1A] animate-spin"
          aria-hidden
        />
        <p className="text-[13px] font-medium text-[#4B5563]">{activeStage}</p>
      </div>

      <div className="mt-3 space-y-2" aria-hidden>
        <div className="h-3 w-[92%] animate-pulse rounded-full bg-black/[0.06]" />
        <div className="h-3 w-[78%] animate-pulse rounded-full bg-black/[0.05]" />
        <div className="h-3 w-[64%] animate-pulse rounded-full bg-black/[0.04]" />
      </div>
    </div>
  );
}
