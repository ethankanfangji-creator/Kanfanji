import { readFileSync } from "node:fs";
import path from "node:path";
import "server-only";
import {
  aiOutputLanguageInstruction,
  resolveAiLocale,
} from "@/lib/ai-boundary/locale";
import { buildPrompt, type PromptCountry, type PromptState } from "@/lib/prompt";

export type { PromptCountry, PromptState };

const FILES = {
  vision: "vision.md",
  report: "report.md",
} as const;

const cache = new Map<string, string>();

export function readPromptFile(name: keyof typeof FILES): string {
  const file = FILES[name];
  const cached = cache.get(file);
  if (cached) return cached;
  const text = readFileSync(path.join(process.cwd(), "prompts", file), "utf8").trim();
  cache.set(file, text);
  return text;
}

export function countryUnits(country: PromptCountry): string {
  if (country === "TW") return "坪、萬、管理費、坐向、壁癌";
  if (country === "CA") return "sqft, strata fee";
  return "sqft, HOA, property tax";
}

export function countryForMarket(market: string | null | undefined): PromptCountry {
  if (market === "US" || market === "CA" || market === "TW") return market;
  return "TW";
}

/** Eagle system prompt with the house, market, and answered keys filled in. */
export function getSystemPrompt(
  country: PromptCountry,
  language: string,
  state: PromptState = {},
): string {
  return buildPrompt(country, language, state);
}

export function getVisionPrompt(language: string): string {
  return `${readPromptFile("vision")}

${aiOutputLanguageInstruction(resolveAiLocale(language))}`;
}

export function getReportPrompt(language: string): string {
  return `${readPromptFile("report")}

${aiOutputLanguageInstruction(resolveAiLocale(language))}`;
}
