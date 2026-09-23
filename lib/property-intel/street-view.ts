/**
 * Google Street View Static API — building facade as default cover image.
 * Returns a URL only; does not download image bytes.
 */
export function buildStreetViewUrl(
  lat: number,
  lng: number,
  size = "640x360",
): string | null {
  const key =
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_STREET_VIEW_API_KEY?.trim() ||
    null;
  if (!key) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/streetview");
  url.searchParams.set("size", size);
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("fov", "90");
  url.searchParams.set("pitch", "0");
  url.searchParams.set("source", "outdoor");
  url.searchParams.set("key", key);
  return url.toString();
}
