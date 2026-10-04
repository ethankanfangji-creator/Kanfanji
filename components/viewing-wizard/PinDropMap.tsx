"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { latLngFromMapClick, panCenter, worldPoint } from "@/lib/map-pin";

const TILE = 256;
const MIN_ZOOM = 15;
const MAX_ZOOM = 19;
const DRAG_THRESHOLD = 6;

export function PinDropMap({
  centerLat,
  centerLng,
  zoom = 17,
  label,
  picked,
  zoomInLabel,
  zoomOutLabel,
  centerLabel,
  onPick,
}: {
  centerLat: number;
  centerLng: number;
  zoom?: number;
  label: string;
  picked: { lat: number; lng: number } | null;
  zoomInLabel: string;
  zoomOutLabel: string;
  centerLabel: string;
  onPick: (pin: { lat: number; lng: number }) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originLat: number;
    originLng: number;
    moved: boolean;
  } | null>(null);
  const [width, setWidth] = useState(320);
  const [view, setView] = useState({ lat: centerLat, lng: centerLng, zoom });

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

  const origin = worldPoint(view.lat, view.lng, view.zoom);
  const originTileX = Math.floor(origin.x / TILE);
  const originTileY = Math.floor(origin.y / TILE);
  const mapHeight = 160;
  const tiles = useMemo(() => {
    const cols = Math.ceil(width / TILE) + 2;
    const rows = Math.ceil(mapHeight / TILE) + 2;
    const list: Array<{ x: number; y: number; left: number; top: number }> = [];
    const startX = originTileX - Math.floor(cols / 2);
    const startY = originTileY - Math.floor(rows / 2);
    for (let x = startX; x < startX + cols; x += 1) {
      for (let y = startY; y < startY + rows; y += 1) {
        list.push({
          x,
          y,
          left: x * TILE - origin.x + width / 2,
          top: y * TILE - origin.y + mapHeight / 2,
        });
      }
    }
    return list;
  }, [origin.x, origin.y, originTileX, originTileY, width, view.zoom]);

  const pin = picked;
  const pinWorld = pin ? worldPoint(pin.lat, pin.lng, view.zoom) : null;
  const pinLeft = pinWorld ? pinWorld.x - origin.x + width / 2 : width / 2;
  const pinTop = pinWorld ? pinWorld.y - origin.y + mapHeight / 2 : mapHeight / 2;

  function dropAt(clientX: number, clientY: number) {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    onPick(
      latLngFromMapClick({
        centerLat: view.lat,
        centerLng: view.lng,
        zoom: view.zoom,
        offsetX: clientX - rect.left - rect.width / 2,
        offsetY: clientY - rect.top - rect.height / 2,
      }),
    );
  }

  return (
    <div className="mt-3 overflow-hidden rounded-[12px] border border-[#BFDBFE] bg-white">
      <div className="flex items-center justify-end gap-1 border-b border-[#BFDBFE] px-2 py-1">
        <button
          type="button"
          className="h-8 rounded-full border border-black/10 px-3 text-[12px] font-bold"
          onClick={() => onPick({ lat: view.lat, lng: view.lng })}
        >
          {centerLabel}
        </button>
        <button
          type="button"
          aria-label={zoomOutLabel}
          className="h-8 w-8 rounded-full border border-black/10 text-[16px] font-bold"
          onClick={() => setView((current) => ({ ...current, zoom: Math.max(MIN_ZOOM, current.zoom - 1) }))}
        >
          −
        </button>
        <button
          type="button"
          aria-label={zoomInLabel}
          className="h-8 w-8 rounded-full border border-black/10 text-[16px] font-bold"
          onClick={() => setView((current) => ({ ...current, zoom: Math.min(MAX_ZOOM, current.zoom + 1) }))}
        >
          +
        </button>
      </div>
      <div
        role="application"
        aria-label={label}
        className="relative h-40 w-full cursor-grab touch-none overflow-hidden bg-[#E5E7EB] active:cursor-grabbing"
        ref={frameRef}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          frameRef.current?.setPointerCapture?.(event.pointerId);
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originLat: view.lat,
            originLng: view.lng,
            moved: false,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const deltaX = event.clientX - drag.startX;
          const deltaY = event.clientY - drag.startY;
          if (!drag.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;
          drag.moved = true;
          const next = panCenter({
            centerLat: drag.originLat,
            centerLng: drag.originLng,
            zoom: view.zoom,
            deltaX,
            deltaY,
          });
          setView((current) => ({ ...current, lat: next.lat, lng: next.lng }));
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          dragRef.current = null;
          if (!drag || drag.pointerId !== event.pointerId) return;
          if (!drag.moved) dropAt(event.clientX, event.clientY);
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onWheel={(event) => {
          event.preventDefault();
          const direction = event.deltaY > 0 ? -1 : 1;
          setView((current) => ({
            ...current,
            zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom + direction)),
          }));
        }}
      >
        {tiles.map((tile) => (
          // OSM tiles are a third-party grid; next/image cannot rewrite them.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${tile.x}:${tile.y}:${view.zoom}`}
            alt=""
            src={`https://tile.openstreetmap.org/${view.zoom}/${tile.x}/${tile.y}.png`}
            className="pointer-events-none absolute h-64 w-64 max-w-none select-none"
            style={{ left: tile.left, top: tile.top }}
            draggable={false}
          />
        ))}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#111]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#111]"
        />
        {pin ? (
          <span
            aria-hidden
            className="pointer-events-none absolute z-10 h-4 w-4 -translate-x-1/2 -translate-y-full rounded-full border-2 border-white bg-[#2563EB] shadow"
            style={{ left: pinLeft, top: pinTop }}
          />
        ) : null}
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
