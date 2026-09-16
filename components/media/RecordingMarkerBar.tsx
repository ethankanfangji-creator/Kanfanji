"use client";

import { AUDIO_MARKER_TAG_IDS, type AudioMarkerTagId } from "@/lib/audio-markers";

export function RecordingMarkerBar({
  title,
  hint,
  labels,
  disabled,
  onAdd,
}: {
  title: string;
  hint: string;
  labels: Record<AudioMarkerTagId, string>;
  disabled?: boolean;
  onAdd: (tagId: AudioMarkerTagId) => void;
}) {
  return (
    <div className="mt-4 w-full">
      <p className="text-[12px] font-bold tracking-wide text-[#1A1A1A]">{title}</p>
      <p className="mt-1 text-[11px] text-[#6B7280] leading-[1.4]">{hint}</p>
      <div
        className="mt-3 grid grid-cols-2 gap-2"
        role="group"
        aria-label={title}
      >
        {AUDIO_MARKER_TAG_IDS.map((tagId) => (
          <button
            key={tagId}
            type="button"
            disabled={disabled}
            onClick={() => onAdd(tagId)}
            className="min-h-12 px-3 rounded-2xl bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8] text-[13px] font-bold active:scale-[0.98] disabled:opacity-45 touch-manipulation"
          >
            {labels[tagId]}
          </button>
        ))}
      </div>
    </div>
  );
}
