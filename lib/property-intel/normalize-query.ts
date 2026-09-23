/**
 * Cheap local address cleanup for cache keys + API queries.
 * Does not call Google — use geocode for lat/lng after this.
 */

const CN_DIGITS: Record<string, string> = {
  零: "0",
  〇: "0",
  一: "1",
  二: "2",
  兩: "2",
  三: "3",
  四: "4",
  五: "5",
  六: "6",
  七: "7",
  八: "8",
  九: "9",
  十: "10",
};

function cnDigitToArabic(ch: string): string {
  return CN_DIGITS[ch] ?? ch;
}

/** Convert common Chinese floor / unit forms: 三樓 → 3樓, 十一樓 → 11樓 */
function normalizeChineseFloors(input: string): string {
  return input
    .replace(/([一二三四五六七八九十兩零〇]+)([樓层層Ff])/g, (_, digits: string, unit: string) => {
      if (digits === "十") return `10${unit}`;
      if (digits.startsWith("十")) {
        const ones = digits.slice(1);
        return `1${ones ? cnDigitToArabic(ones) : "0"}${unit}`;
      }
      if (digits.endsWith("十") && digits.length === 2) {
        return `${cnDigitToArabic(digits[0]!)}0${unit}`;
      }
      if (digits.includes("十")) {
        const [tens, ones = ""] = digits.split("十");
        return `${cnDigitToArabic(tens || "1")}${ones ? cnDigitToArabic(ones) : "0"}${unit}`;
      }
      return `${[...digits].map(cnDigitToArabic).join("")}${unit}`;
    })
    .replace(/第\s*(\d+)\s*([樓层層])/g, "$1$2");
}

/**
 * Canonical query string for cache keys and upstream lookups.
 * - 台 → 臺 (TW open-data often uses 臺)
 * - collapse whitespace / fullwidth digits
 * - Chinese floor numbers → Arabic
 * - strip trailing unit fluff that breaks street-level match (kept lightly)
 */
export function canonicalizeAddressQuery(raw: string): string {
  let s = raw.normalize("NFKC").trim();
  if (!s) return "";

  s = s.replace(/台/g, "臺");
  s = s.replace(/[\u3000\s]+/g, " ");
  s = s.replace(/[，、]/g, ",");
  s = normalizeChineseFloors(s);
  // Unify common floor markers
  s = s.replace(/(\d+)\s*[Ff]\b/g, "$1樓");
  s = s.replace(/(\d+)\s*[层層]/g, "$1樓");
  // Drop noisy unit suffixes for street-level cache (keep 號)
  s = s.replace(/\s*(之\d+|號之\d+)\s*$/u, "");
  s = s.replace(/[.#]+$/g, "").trim();
  return s;
}

/** Stable lowercase cache key material (not a hash yet). */
export function addressCacheMaterial(raw: string): string {
  return canonicalizeAddressQuery(raw).toLowerCase();
}
