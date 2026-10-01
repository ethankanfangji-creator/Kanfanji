/**
 * Canonical LLM system rules for viewing-chat collection / reply polish.
 * Keep in sync with product progressive-collection contract.
 *
 * Language for user-visible output is injected via {@link aiOutputLanguageInstruction}
 * from the request locale (default zh-Hant). Model ids stay unchanged.
 */

import { DEFAULT_AI_LOCALE } from "@/lib/ai-boundary/locale";
import { countryForMarket, getReportPrompt, getSystemPrompt, type PromptCountry } from "@/lib/prompts/get-system-prompt";

function countryForLocale(locale: string): PromptCountry {
  const lower = locale.toLowerCase();
  if (lower.includes("ca")) return "CA";
  if (lower.startsWith("en")) return "US";
  return "TW";
}

export function viewingRecorderSystemPrompt(
  locale: string = DEFAULT_AI_LOCALE,
  country?: PromptCountry,
): string {
  return getSystemPrompt(country ?? countryForLocale(locale), locale);
}

export function viewingRecorderPolishRules(
  locale: string = DEFAULT_AI_LOCALE,
): string {
  return `${viewingRecorderSystemPrompt(locale)}
潤飾只改語氣，不可新增事實，不可把否定說反。`;
}

export function viewingRecorderReportRules(
  locale: string = DEFAULT_AI_LOCALE,
): string {
  return getReportPrompt(locale);
}

export { countryForMarket };

/** @deprecated Prefer viewingRecorderSystemPrompt(locale) — kept for default zh-Hant callers. */
export const VIEWING_RECORDER_SYSTEM_PROMPT = viewingRecorderSystemPrompt();
/** @deprecated Prefer viewingRecorderPolishRules(locale) */
export const VIEWING_RECORDER_POLISH_RULES = viewingRecorderPolishRules();
/** @deprecated Prefer viewingRecorderReportRules(locale) */
export const VIEWING_RECORDER_REPORT_RULES = viewingRecorderReportRules();
