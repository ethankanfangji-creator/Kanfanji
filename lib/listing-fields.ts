export type ListingExtract = {
  address: string | null;
  price: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  year: number | null;
  strata: string | null;
  type: string | null;
  photos: string[];
};

export function emptyListingExtract(): ListingExtract {
  return {
    address: null,
    price: null,
    beds: null,
    baths: null,
    sqft: null,
    year: null,
    strata: null,
    type: null,
    photos: [],
  };
}

export function isBlankListing(listing: ListingExtract): boolean {
  return (
    !listing.address &&
    !listing.price &&
    listing.beds == null &&
    listing.baths == null &&
    listing.sqft == null &&
    listing.year == null &&
    !listing.strata &&
    !listing.type &&
    listing.photos.length === 0
  );
}

export function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 500);
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function yearOrNull(value: unknown): number | null {
  const parsed = numberOrNull(value);
  if (parsed == null) return null;
  const year = Math.round(parsed);
  const max = new Date().getUTCFullYear() + 2;
  if (year < 1800 || year > max) return null;
  return year;
}

export function photoUrlsFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const urls: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const safe = safeHttpUrl(item);
    if (!safe || urls.includes(safe)) continue;
    urls.push(safe);
    if (urls.length >= 8) break;
  }
  return urls;
}

export function parseListingExtract(raw: unknown): ListingExtract {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    address: textOrNull(row.address),
    price: textOrNull(row.price),
    beds: numberOrNull(row.beds),
    baths: numberOrNull(row.baths),
    sqft: numberOrNull(row.sqft),
    year: yearOrNull(row.year),
    strata: textOrNull(row.strata),
    type: textOrNull(row.type),
    photos: photoUrlsFromUnknown(row.photos),
  };
}

export function collectListingPhotoUrls(html: string, pageUrl: string): string[] {
  const found: string[] = [];
  const push = (raw: string) => {
    if (found.length >= 8) return;
    let absolute = raw.trim();
    if (!absolute || absolute.startsWith("data:")) return;
    try {
      absolute = new URL(absolute, pageUrl).toString();
    } catch {
      return;
    }
    const safe = safeHttpUrl(absolute);
    if (!safe || found.includes(safe)) return;
    found.push(safe);
  };

  const img = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  const og = /<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/gi;
  const ogAlt = /<meta\b[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:image["']/gi;
  for (const pattern of [og, ogAlt, img]) {
    for (const match of html.matchAll(pattern)) {
      if (match[1]) push(match[1]);
    }
  }
  return found;
}
