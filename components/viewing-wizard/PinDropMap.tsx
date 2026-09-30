"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { latLngFromMapClick, worldPoint } from "@/lib/map-pin";

const TILE = 256;

export function PinDropMap({
  centerLat,
  centerLng,
  zoom = 17,
  label,
  picked,
  onPick,
}: {
  centerLat: number;
  centerLng: number;
  zoom?: number;
  label: string;
  picked: { lat: number; lng: number } | null;
  onPick: (pin: { lat: number; lng: number }) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth || 320);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const origin = worldPoint(centerLat, centerLng, zoom);
  const originTileX = Math.floor(origin.x / TILE);
  const originTileY = Math.floor(origin.y / TILE);
  const tiles = useMemo(() => {
    const cols = Math.ceil(width / TILE) + 2;
    const rows = Math.ceil(220 / TILE) + 2;
    const list: Array<{ x: number; y: number; left: number; top: number }> = [];
    const startX = originTileX - Math.floor(cols / 2);
    const startY = originTileY - Math.floor(rows / 2);
    for (let x = startX; x < startX + cols; x += 1) {
      for (let y = startY; y < startY + rows; y += 1) {
        list.push({
          x,
          y,
          left: x * TILE - origin.x + width / 2,
          top: y * TILE - origin.y + 110,
        });
      }
    }
    return list;
  }, [origin.x, origin.y, originTileX, originTileY, width]);

  const pin = picked ?? { lat: centerLat, lng: centerLng };
  const pinWorld = worldPoint(pin.lat, pin.lng, zoom);
  const pinLeft = pinWorld.x - origin.x + width / 2;
  const pinTop = pinWorld.y - origin.y + 110;

  return (
    <div className="mt-3 overflow-hidden rounded-[12px] border border-[#BFDBFE] bg-white">
      <div
        role="application"
        aria-label={label}
        className="relative h-[220px] w-full cursor-crosshair overflow-hidden bg-[#E5E7EB]"
        ref={frameRef}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          onPick(
            latLngFromMapClick({
              centerLat,
              centerLng,
              zoom,
              offsetX: event.clientX - rect.left - rect.width / 2,
              offsetY: event.clientY - rect.top - rect.height / 2,
            }),
          );
        }}
      >
        {tiles.map((tile) => (
          // OSM tiles are a third-party grid; next/image cannot rewrite them.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${tile.x}:${tile.y}`}
            alt=""
            src={`https://tile.openstreetmap.org/${zoom}/${tile.x}/${tile.y}.png`}
            className="absolute h-64 w-64 max-w-none select-none"
            style={{ left: tile.left, top: tile.top }}
            draggable={false}
          />
        ))}
        <span
          aria-hidden
          className="pointer-events-none absolute z-10 h-3 w-3 -translate-x-1/2 -translate-y-full rounded-full border-2 border-white bg-[#2563EB] shadow"
          style={{ left: pinLeft, top: pinTop }}
        />
      </div>
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
        className="block px-3 py-1.5 text-[10px] text-[#6B7280] underline-offset-2 hover:underline"
      >
        © OpenStreetMap
      </a>
    </div>
  );
}
