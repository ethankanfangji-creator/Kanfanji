"use client";

import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { useI18n } from "@/components/I18nProvider";

export function LanguageSwitcher() {
  const { locale, setLocale, messages } = useI18n();

  return (
    <label className="inline-flex items-center gap-1.5 h-8 px-2 rounded-full bg-white border border-black/10">
      <span className="sr-only">{messages.language.label}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        className="bg-transparent text-[11px] font-bold outline-none max-w-[72px]"
        aria-label={messages.language.label}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
