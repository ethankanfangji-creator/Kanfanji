import { readFileSync } from "node:fs";
import path from "node:path";
import "server-only";

export type PromptCountry = "US" | "CA" | "TW";

export type PromptState = {
  address?: string;
  progress?: number;
  answered_keys?: string[];
};

let template: string | null = null;

function systemTemplate(): string {
  if (template) return template;
  template = readFileSync(path.join(process.cwd(), "prompts", "system_main.md"), "utf8").trim();
  return template;
}

/** Fill prompts/system_main.md with the house, market, language, and what is already answered. */
export function buildPrompt(country: PromptCountry, language: string, state: PromptState): string {
  const progress = Math.max(0, Math.min(100, Math.round(state.progress ?? 0)));
  const answered = (state.answered_keys ?? []).filter((key) => key.trim()).join(", ");
  return systemTemplate()
    .replaceAll("{{address}}", state.address?.trim() || "unknown")
    .replaceAll("{{country}}", country)
    .replaceAll("{{language}}", language)
    .replaceAll("{{progress}}", String(progress))
    .concat(`\nanswered_keys: ${answered || "(none)"}`);
}
