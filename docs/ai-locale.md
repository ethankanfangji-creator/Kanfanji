# AI / UI locale locking

## Default

When a request omits `locale` (missing or empty), the server uses **`zh-Hant`**
(`DEFAULT_AI_LOCALE` in `lib/ai-boundary/locale.ts`). Invalid non-empty values
still return `locale_invalid` and do **not** bypass consent or quota checks.

UI default is the same **`zh-Hant`** (`DEFAULT_LOCALE` in `lib/i18n/config.ts`)
until the user picks another language (stored in `localStorage`).

## Client

`I18nProvider` stores the user choice in `localStorage` (`kanfangji.locale`) and
exposes `locale` via `useI18n()`. Viewing chat and wizard forms append that
value on AI requests.

Marketing copy (brand subtitle / eyebrow), empty states, examples, support
mailto prompts, and AI-failure CTAs live in `lib/i18n/messages/*` — avoid
hardcoding English in components.

## Server prompts

`aiOutputLanguageInstruction(locale)` is injected into process-recording,
vision, property-source vision extract, viewing-chat polish/report, highlights,
and property-basics so model **output** matches the request locale. Whisper
uses `aiWhisperLanguage(locale)`. Model ids are unchanged.
