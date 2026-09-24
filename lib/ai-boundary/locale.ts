/**
 * AI output language locking.
 *
 * Server routes resolve locale from the validated request body/form (after
 * consent + quota/auth). Missing/empty locale defaults to {@link DEFAULT_AI_LOCALE}
 * (`zh-Hant`). Invalid non-empty values still fail validation with `locale_invalid`.
 *
 * Do not use locale to bypass quota or auth — it only selects prompt language.
 */

import { AI_LOCALES, type AiLocale } from "./config";

/** Documented default when the client omits locale. */
export const DEFAULT_AI_LOCALE: AiLocale = "zh-Hant";

export function isAiLocale(value: unknown): value is AiLocale {
  return typeof value === "string" && (AI_LOCALES as readonly string[]).includes(value);
}

/**
 * Resolve a request locale for AI calls.
 * - missing / empty → DEFAULT_AI_LOCALE
 * - known AiLocale → as-is
 * - other non-empty strings → best-effort map (en*, th*, zh-Hans/cn → Hans, else Hant)
 */
export function resolveAiLocale(value: unknown): AiLocale {
  if (value == null) return DEFAULT_AI_LOCALE;
  if (typeof value !== "string") return DEFAULT_AI_LOCALE;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_AI_LOCALE;
  if (isAiLocale(trimmed)) return trimmed;

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("th")) return "th";
  if (lower.startsWith("en")) return "en";
  if (
    lower.includes("hans") ||
    lower.includes("cn") ||
    lower === "zh-cn" ||
    lower.startsWith("zh-cn")
  ) {
    return "zh-Hans";
  }
  if (lower.startsWith("zh")) return "zh-Hant";
  return DEFAULT_AI_LOCALE;
}

/** Human-readable language name for prompt instructions. */
export function aiOutputLanguageName(locale: AiLocale | string): string {
  const resolved = resolveAiLocale(locale);
  switch (resolved) {
    case "th":
      return "Thai (ภาษาไทย)";
    case "en":
      return "English";
    case "zh-Hans":
      return "Simplified Chinese (简体中文)";
    default:
      return "Traditional Chinese (繁體中文)";
  }
}

/**
 * Explicit instruction that MUST appear in AI system/user prompts so model
 * output matches the request locale. Models stay the same; only language locks.
 */
export function aiOutputLanguageInstruction(locale: AiLocale | string): string {
  const name = aiOutputLanguageName(locale);
  return `Output language (mandatory): write ALL user-visible text in ${name} only. Do not switch languages or mix scripts unless quoting a source verbatim.`;
}

/** Whisper `language` code for the locale (does not change model id). */
export function aiWhisperLanguage(locale: AiLocale | string): string {
  const resolved = resolveAiLocale(locale);
  switch (resolved) {
    case "th":
      return "th";
    case "en":
      return "en";
    default:
      return "zh";
  }
}
