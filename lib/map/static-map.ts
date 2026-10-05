import { worldPoint } from "@/lib/map-pin";

const TILE = 256;

/**
 * OpenStreetMap raster tile URL (same source as PinDropMap).
 * Prefer client rendering for list covers — OSM tiles work without GOOGLE_MAPS_API_KEY.
 */
export function osmTileUrl(z: number, x: number, y: number): string {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

export function mapTilesForCenter(input: {
  lat: number;
  lng: number;
  zoom: number;
  width: number;
  height: number;
}): Array<{ x: number; y: number; left: number; top: number }> {
  const origin = worldPoint(input.lat, input.lng, input.zoom);
  const originTileX = Math.floor(origin.x / TILE);
  const originTileY = Math.floor(origin.y / TILE);
  const cols = Math.ceil(input.width / TILE) + 2;
  const rows = Math.ceil(input.height / TILE) + 2;
  const startX = originTileX - Math.floor(cols / 2);
  const startY = originTileY - Math.floor(rows / 2);
  const list: Array<{ x: number; y: number; left: number; top: number }> = [];
  for (let x = startX; x < startX + cols; x += 1) {
    for (let y = startY; y < startY + rows; y += 1) {
      list.push({
        x,
        y,
        left: x * TILE - origin.x + input.width / 2,
        top: y * TILE - origin.y + input.height / 2,
      });
    }
  }
  return list;
}

export function parseMapCoordinate(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
