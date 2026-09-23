/**
 * Compact one-line label for chat titles and history rows.
 * Keeps street + city (+ region); drops country and noisy OSM tails.
 */
export function shortenAddressLabel(address: string, maxLen = 42): string {
  const raw = address.trim().replace(/\s+/g, " ");
  if (!raw) return "";

  // Continuous CJK (e.g. Taiwan) — no comma structure; soft truncate only.
  if (!raw.includes(",") && /[\u4e00-\u9fff]/.test(raw)) {
    return raw.length > maxLen ? `${raw.slice(0, Math.max(1, maxLen - 1))}…` : raw;
  }

  let parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const countryName =
    /^(USA|U\.S\.A\.|United States|Canada|Taiwan|台灣|臺灣|中華民國|Republic of China)$/i;
  while (parts.length > 1 && countryName.test(parts[parts.length - 1]!)) {
    parts.pop();
  }

  // Trailing country codes only when we still have street + locality.
  while (parts.length > 2 && /^(US|CA|TW)$/i.test(parts[parts.length - 1]!)) {
    parts.pop();
  }

  if (parts.length > 3) {
    parts = parts.slice(0, 3);
  }

  parts = parts.map((part, index) => {
    if (index !== parts.length - 1) return part;
    const usZip = part.match(/^([A-Z]{2})\s+\d{5}(-\d{4})?$/i);
    if (usZip) return usZip[1]!.toUpperCase();
    const caPostal = part.match(/^([A-Z]{2})\s+[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i);
    if (caPostal) return caPostal[1]!.toUpperCase();
    return part;
  });

  let out = parts.join(", ");
  if (out.length <= maxLen) return out;

  if (parts.length >= 2) {
    const two = `${parts[0]}, ${parts[1]}`;
    if (two.length <= maxLen) return two;
  }

  const head = parts[0] || out;
  return head.length > maxLen ? `${head.slice(0, Math.max(1, maxLen - 1))}…` : head;
}
