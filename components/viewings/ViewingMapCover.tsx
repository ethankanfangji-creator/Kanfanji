"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { mapTilesForCenter, osmTileUrl } from "@/lib/map/static-map";

const ZOOM = 16;

/** Non-interactive OSM tile cover with pin on the confirmed coordinate. */
export function ViewingMapCover({ lat, lng }: { lat: number; lng: number }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 320, height: 180 });

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const measure = () => {
      const width = node.clientWidth || 320;
      const height = node.clientHeight || Math.round((width * 3) / 4);
      setSize({ width, height });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const tiles = useMemo(
    () =>
      mapTilesForCenter({
        lat,
        lng,
        zoom: ZOOM,
        width: size.width,
        height: size.height,
      }),
    [lat, lng, size.height, size.width],
  );

  return (
    <div
      ref={frameRef}
      className="relative h-full w-full overflow-hidden bg-[#E8EEF2]"
      aria-hidden
    >
      {tiles.map((tile) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${tile.x}:${tile.y}`}
          src={osmTileUrl(ZOOM, tile.x, tile.y)}
          alt=""
          draggable={false}
          className="pointer-events-none absolute max-w-none"
          style={{ left: tile.left, top: tile.top, width: 256, height: 256 }}
        />
      ))}
      <MapPin
        className="pointer-events-none absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-full text-[#111111] drop-shadow-[0_1px_1px_rgba(255,255,255,0.9)] sm:h-6 sm:w-6"
        strokeWidth={2.25}
      />
    </div>
  );
}
