/** Build a Google Static Maps URL (server-side key only — never expose to the client). */

export function buildGoogleStaticMapUrl(input: {
  lat: number;
  lng: number;
  width: number;
  height: number;
  zoom?: number;
  scale?: 1 | 2;
  apiKey: string;
}): string {
  const width = Math.min(640, Math.max(80, Math.round(input.width)));
  const height = Math.min(640, Math.max(80, Math.round(input.height)));
  const zoom = Math.min(20, Math.max(12, Math.round(input.zoom ?? 15)));
  const scale = input.scale === 1 ? 1 : 2;
  const params = new URLSearchParams({
    center: `${input.lat},${input.lng}`,
    zoom: String(zoom),
    size: `${width}x${height}`,
    scale: String(scale),
    maptype: "roadmap",
    markers: `color:0x111111|${input.lat},${input.lng}`,
    key: input.apiKey,
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

export function parseMapCoverQuery(searchParams: URLSearchParams): {
  lat: number;
  lng: number;
  width: number;
  height: number;
  zoom: number;
} | null {
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const width = Number(searchParams.get("w") ?? 640);
  const height = Number(searchParams.get("h") ?? 360);
  const zoom = Number(searchParams.get("z") ?? 15);
  return {
    lat,
    lng,
    width: Number.isFinite(width) ? width : 640,
    height: Number.isFinite(height) ? height : 360,
    zoom: Number.isFinite(zoom) ? zoom : 15,
  };
}
