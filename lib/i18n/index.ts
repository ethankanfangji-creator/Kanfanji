import { DEFAULT_LOCALE, type Locale } from "./config";
import type { Messages } from "./types";
import en from "./messages/en";
import th from "./messages/th";
import zhHans from "./messages/zh-Hans";
import zhHant from "./messages/zh-Hant";

const catalog: Record<Locale, Messages> = {
  "zh-Hant": zhHant,
  "zh-Hans": zhHans,
  en,
  th,
};

export function getMessages(locale: Locale): Messages {
  return catalog[locale] ?? catalog[DEFAULT_LOCALE];
}

export function formatMessage(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars[key] != null ? String(vars[key]) : `{${key}}`,
  );
}

export function bankQuestions(
  locale: Locale,
  market: "CA" | "TH" | "OTHER",
): Array<{ id: number; text: string }> {
  const messages = getMessages(locale);
  const list = market === "TH" ? messages.questions.th : messages.questions.ca;
  return list.map((text, index) => ({ id: index + 1, text }));
}
