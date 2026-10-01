"use client";

import { useEffect, useState } from "react";
import type { ChatFace } from "@/lib/collaboration/types";

export function ChatFaces({ viewingId }: { viewingId: string }) {
  const [faces, setFaces] = useState<ChatFace[]>([]);

  useEffect(() => {
    let active = true;
    void fetch(`/api/viewings/${viewingId}/collaboration`)
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { faces?: ChatFace[] };
        if (active) setFaces(body.faces ?? []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [viewingId]);

  if (faces.length === 0) return null;

  return (
    <ul className="flex items-center gap-2" aria-label="成員">
      {faces.map((face) => (
        <li key={face.userId} title={face.label} className="flex items-center gap-1">
          {face.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={face.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E7D8C9] text-[12px] font-bold">
              {face.label.slice(0, 1)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
