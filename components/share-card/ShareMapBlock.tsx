"use client";

import { MapPin } from "lucide-react";
import { ViewingMapCover } from "@/components/viewings/ViewingMapCover";
import { buildOpenInMapsUrl } from "@/lib/map/open-in-maps";

/** Inline map + link that opens the viewer's default maps app / website. */
export function ShareMapBlock({
  lat,
  lng,
  address,
  openMapLabel,
}: {
  lat: number;
  lng: number;
  address?: string | null;
  openMapLabel: string;
}) {
  const openUrl = buildOpenInMapsUrl(lat, lng, address);
  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-[#F5F3F0]">
      <div className="aspect-[16/9] w-full sm:aspect-[2/1]">
        <ViewingMapCover lat={lat} lng={lng} />
      </div>
      <a
        href={openUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-[var(--touch-target)] items-center gap-1.5 px-3 text-[12px] font-semibold text-[#1D4ED8] underline-offset-2 hover:underline"
      >
        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {openMapLabel}
      </a>
    </div>
  );
}
