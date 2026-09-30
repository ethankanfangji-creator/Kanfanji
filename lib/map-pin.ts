/** Between Coquitlam and Port Moody. Used when a street hint has no coordinate. */
export const COQUITLAM_PORT_MOODY_CENTER = {
  latitude: 49.283,
  longitude: -122.824,
} as const;

const TILE = 256;

export function worldPoint(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = TILE * 2 ** zoom;
  const x = ((lng + 180) / 360) * scale;
  const clamped = Math.max(-85, Math.min(85, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return { x, y };
}

/** Pixel offset from the map center, y positive downward. */
export function latLngFromMapClick(input: {
  centerLat: number;
  centerLng: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
}): { lat: number; lng: number } {
  const origin = worldPoint(input.centerLat, input.centerLng, input.zoom);
  const scale = TILE * 2 ** input.zoom;
  const x = origin.x + input.offsetX;
  const y = origin.y + input.offsetY;
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}
