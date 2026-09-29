const URL_RE = /https?:\/\/[^\s<>"']+/i;
const LISTING_FEATURES = [
  /價格|售價|開價|price|\$\s?\d/i,
  /坪|sq\s*ft|sqft/i,
  /房|bed(?:room)?s?/i,
  /衛|bath/i,
  /\bMLS\b/i,
  /管理費|strata|\bHOA\b/i,
];

export function extractFirstUrl(text: string): string | null {
  const match = text.match(URL_RE);
  if (!match) return null;
  return match[0].replace(/[)\]）】、，。．.!?！？]+$/u, "");
}

export function isListingPaste(text: string): boolean {
  const body = text.trim();
  if (body.length < 300) return false;
  const hits = LISTING_FEATURES.filter((pattern) => pattern.test(body)).length;
  return hits >= 2;
}

export function pdfSourceRole(text: string): "hoa_doc" | "listing" {
  if (/strata|HOA|bylaws|minutes|depreciation report|管委會|規約|會議紀錄/i.test(text)) {
    return "hoa_doc";
  }
  return "listing";
}
