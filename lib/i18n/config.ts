export const LOCALES = ["zh-Hant", "zh-Hans", "en", "th"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "zh-Hant";
export const LOCALE_STORAGE_KEY = "kanfangji.locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  "zh-Hant": "繁中",
  "zh-Hans": "简中",
  en: "EN",
  th: "ไทย",
};

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/** Map browser / system language to an app locale. */
export function detectLocale(input?: string | null): Locale {
  const raw = (input || "").toLowerCase();
  if (!raw) return DEFAULT_LOCALE;

  if (raw.startsWith("th")) return "th";
  if (raw.startsWith("en")) return "en";
  if (raw.startsWith("zh")) {
    if (
      raw.includes("cn") ||
      raw.includes("hans") ||
      raw.includes("sg") ||
      raw.includes("my")
    ) {
      return "zh-Hans";
    }
    return "zh-Hant";
  }
  return DEFAULT_LOCALE;
}

export function htmlLang(locale: Locale): string {
  switch (locale) {
    case "zh-Hans":
      return "zh-Hans";
    case "en":
      return "en";
    case "th":
      return "th";
    default:
      return "zh-Hant";
  }
}

/** Whisper / GPT language hints */
export function speechLanguage(locale: Locale): string {
  switch (locale) {
    case "th":
      return "th";
    case "en":
      return "en";
    case "zh-Hans":
      return "zh";
    default:
      return "zh";
  }
}

export function uiLanguageName(locale: Locale): string {
  switch (locale) {
    case "zh-Hans":
      return "简体中文";
    case "en":
      return "English";
    case "th":
      return "ภาษาไทย";
    default:
      return "繁體中文";
  }
}
