"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  clampSeekTime,
  formatMarkerTime,
  sortMarkers,
  type AudioMarker,
  type AudioMarkerTagId,
} from "@/lib/audio-markers";

export function AudioNotePlayer({
  src,
  durationSec,
  markers,
  labels,
  playLabel,
  markersTitle,
  editLabel,
  deleteLabel,
  notePlaceholder,
  saveLabel,
  cancelLabel,
  emptyMarkers,
  onSeek,
  onUpdateMarker,
  onDeleteMarker,
}: {
  src?: string;
  durationSec: number;
  markers: AudioMarker[];
  labels: Record<AudioMarkerTagId, string>;
  playLabel: string;
  markersTitle: string;
  editLabel: string;
  deleteLabel: string;
  notePlaceholder: string;
  saveLabel: string;
  cancelLabel: string;
  emptyMarkers: string;
  onSeek?: (timeSec: number) => void;
  onUpdateMarker: (id: string, patch: { note?: string; tagId?: AudioMarkerTagId }) => void;
  onDeleteMarker: (id: string) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const listId = useId();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    function onTime() {
      setCurrentTime(audio?.currentTime ?? 0);
    }
    audio.addEventListener("timeupdate", onTime);
    return () => audio.removeEventListener("timeupdate", onTime);
  }, [src]);

  function seekTo(timeSec: number) {
    const audio = audioRef.current;
    const next = clampSeekTime(timeSec, durationSec || audio?.duration || 0);
    if (audio) {
      audio.currentTime = next;
      void audio.play().catch(() => undefined);
    }
    onSeek?.(next);
  }

  const sorted = sortMarkers(markers);

  return (
    <div className="mt-3 rounded-xl bg-white border border-[#DBEAFE] p-3">
      {src ? (
        <audio
          ref={audioRef}
          src={src}
          controls
          preload="metadata"
          className="w-full"
          aria-label={playLabel}
        />
      ) : (
        <p className="text-[12px] text-[#6B7280]">{playLabel}</p>
      )}
      <p className="mt-2 text-[10px] text-[#9CA3AF] font-mono">
        {formatMarkerTime(currentTime)} / {formatMarkerTime(durationSec)}
      </p>

      <h4 id={listId} className="mt-3 text-[11px] font-bold tracking-wide text-[#2563EB]">
        {markersTitle}
      </h4>
      {sorted.length === 0 ? (
        <p className="mt-1.5 text-[12px] text-[#6B7280]">{emptyMarkers}</p>
      ) : (
        <ul className="mt-2 space-y-2" aria-labelledby={listId}>
          {sorted.map((marker) => (
            <li key={marker.id} className="rounded-xl bg-[#F8FAFF] border border-[#DBEAFE] p-2.5">
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => seekTo(marker.timeSec)}
                  className="min-h-11 min-w-[64px] px-2 rounded-xl bg-[#DBEAFE] text-[#1D4ED8] text-[12px] font-bold font-mono touch-manipulation"
                  aria-label={`${formatMarkerTime(marker.timeSec)} ${labels[marker.tagId]}`}
                >
                  {formatMarkerTime(marker.timeSec)}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#1A1A1A]">
                    {labels[marker.tagId]}
                  </p>
                  {marker.note ? (
                    <p className="text-[12px] text-[#4B5563] mt-0.5 leading-[1.35]">{marker.note}</p>
                  ) : null}
                </div>
              </div>
              {editingId === marker.id ? (
                <div className="mt-2 space-y-2">
                  <label className="block">
                    <span className="sr-only">{notePlaceholder}</span>
                    <input
                      value={editNote}
                      onChange={(event) => setEditNote(event.target.value)}
                      placeholder={notePlaceholder}
                      className="w-full h-11 px-3 rounded-xl bg-white border border-black/10 text-[13px] outline-none focus:ring-2 focus:ring-black/15"
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="h-11 flex-1 rounded-full bg-black text-white text-[12px] font-bold"
                      onClick={() => {
                        onUpdateMarker(marker.id, { note: editNote });
                        setEditingId(null);
                      }}
                    >
                      {saveLabel}
                    </button>
                    <button
                      type="button"
                      className="h-11 flex-1 rounded-full bg-white border border-black/10 text-[12px] font-bold"
                      onClick={() => setEditingId(null)}
                    >
                      {cancelLabel}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="h-11 flex-1 rounded-full bg-white border border-black/10 text-[12px] font-bold"
                    onClick={() => {
                      setEditingId(marker.id);
                      setEditNote(marker.note);
                    }}
                  >
                    {editLabel}
                  </button>
                  <button
                    type="button"
                    className="h-11 flex-1 rounded-full bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-[12px] font-bold"
                    onClick={() => onDeleteMarker(marker.id)}
                  >
                    {deleteLabel}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
