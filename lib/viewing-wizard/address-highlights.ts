/**
 * Address → viewing highlights for Step 2.
 * Deterministic Open Data / market rules always run; optional AI can enrich.
 */

import type { WizardQuestion } from "./questions";

/** Stable id range for address-derived highlight questions. */
export const ADDRESS_HIGHLIGHT_ID_BASE = 700_000;

export type AddressHighlightInput = {
  address: string;
  market: "CA" | "US" | "TW" | "TH" | "OTHER";
  tags?: string[];
  openData?: {
    city?: string;
    zoningCode?: string;
    zoningLabel?: string;
    pid?: string;
    planNumber?: string;
    lotNumber?: string;
  } | null;
  neighborhood?: string;
  city?: string;
};

export type AddressHighlight = {
  text: string;
  hint?: string;
  source: "opendata" | "address";
};

/** Locale-agnostic templates; UI can replace via i18n map when provided. */
export type AddressHighlightTemplates = {
  zoningAsk: (zoning: string, label?: string) => string;
  pidAsk: (pid: string) => string;
  neighborhoodNoise: (place: string) => string;
  strataCommon: string;
  moistureCoastal: string;
  condoParking: string;
  bangkokCondo: string;
  bangkokFlood: string;
  genericStructure: string;
  genericSystems: string;
  genericNeighborhood: string;
};

export const DEFAULT_ADDRESS_HIGHLIGHT_TEMPLATES: AddressHighlightTemplates = {
  zoningAsk: (zoning, label) =>
    label
      ? `What does zoning ${zoning} (${label}) allow for renovations or rental use here?`
      : `What does zoning ${zoning} allow for renovations or rental use here?`,
  pidAsk: (pid) => `Confirm the parcel / legal description matches PID ${pid}.`,
  neighborhoodNoise: (place) =>
    `Any traffic, transit, or neighbor noise concerns around ${place}?`,
  strataCommon:
    "Ask for recent strata minutes, special assessments, and contingency fund balance.",
  moistureCoastal:
    "Check for moisture, mold, or envelope issues common in coastal BC buildings.",
  condoParking: "Confirm parking stall / storage locker assignment and any fees.",
  bangkokCondo: "Ask about common-area fees, sinking fund, and building management quality.",
  bangkokFlood: "Any flood history, drainage issues, or ground-floor moisture?",
  genericStructure: "Any visible cracks, settlement, or structural concerns?",
  genericSystems: "Age and condition of roof, HVAC, and electrical panel?",
  genericNeighborhood: "How does the street feel at night for noise and safety?",
};

export function buildDeterministicAddressHighlights(
  input: AddressHighlightInput,
  templates: AddressHighlightTemplates = DEFAULT_ADDRESS_HIGHLIGHT_TEMPLATES,
): AddressHighlight[] {
  const highlights: AddressHighlight[] = [];
  const od = input.openData ?? null;
  const place =
    input.neighborhood?.trim() ||
    input.city?.trim() ||
    (typeof od?.city === "string" ? od.city.trim() : "") ||
    "";

  if (od?.zoningCode?.trim()) {
    highlights.push({
      text: templates.zoningAsk(od.zoningCode.trim(), od.zoningLabel?.trim() || undefined),
      hint: od.zoningLabel || od.zoningCode,
      source: "opendata",
    });
  }
  if (od?.pid?.trim()) {
    highlights.push({
      text: templates.pidAsk(od.pid.trim()),
      hint: `PID ${od.pid.trim()}`,
      source: "opendata",
    });
  }
  if (place) {
    highlights.push({
      text: templates.neighborhoodNoise(place),
      hint: place,
      source: "address",
    });
  }

  if (input.market === "CA") {
    highlights.push({ text: templates.strataCommon, source: "address" });
    highlights.push({ text: templates.moistureCoastal, source: "address" });
    highlights.push({ text: templates.condoParking, source: "address" });
  } else if (input.market === "TH") {
    highlights.push({ text: templates.bangkokCondo, source: "address" });
    highlights.push({ text: templates.bangkokFlood, source: "address" });
  } else {
    highlights.push({ text: templates.genericStructure, source: "address" });
    highlights.push({ text: templates.genericSystems, source: "address" });
    highlights.push({ text: templates.genericNeighborhood, source: "address" });
  }

  // Dedupe by normalized text, keep order, cap at 8.
  const seen = new Set<string>();
  const unique: AddressHighlight[] = [];
  for (const item of highlights) {
    const key = item.text.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
    if (unique.length >= 8) break;
  }
  return unique;
}

export function addressHighlightsToQuestions(
  highlights: AddressHighlight[],
  existing: WizardQuestion[] = [],
): WizardQuestion[] {
  const existingTexts = new Set(
    existing.map((q) => q.text.trim().toLowerCase()).filter(Boolean),
  );
  const out: WizardQuestion[] = [];
  let index = 0;
  for (const highlight of highlights) {
    const key = highlight.text.trim().toLowerCase();
    if (!key || existingTexts.has(key)) continue;
    existingTexts.add(key);
    out.push({
      id: ADDRESS_HIGHLIGHT_ID_BASE + index,
      text: highlight.text.trim(),
      checked: false,
      isDynamic: true,
      source: highlight.source,
      hint: highlight.hint,
    });
    index += 1;
  }
  return out;
}

export function mergeAddressHighlightQuestions(
  current: WizardQuestion[],
  highlights: AddressHighlight[],
): WizardQuestion[] {
  const additions = addressHighlightsToQuestions(highlights, current);
  if (additions.length === 0) return current;
  // Keep checklist defaults first; append address highlights before other extras.
  const checklist = current.filter((q) => q.source === "checklist");
  const nonChecklist = current.filter((q) => q.source !== "checklist");
  const additionTexts = new Set(additions.map((q) => q.text.trim().toLowerCase()));
  const rest = nonChecklist.filter(
    (q) => !additionTexts.has(q.text.trim().toLowerCase()),
  );
  return [...checklist, ...additions, ...rest];
}

export function parseAiHighlightLines(raw: string): string[] {
  return raw
    .split(/\n+/)
    .map((line) =>
      line
        .trim()
        .replace(/^[-*•]\s*/, "")
        .replace(/^\d+[\.\、\)]\s*/, "")
        .replace(/^["「『]|["」』]$/g, "")
        .trim(),
    )
    .filter((line) => line.length >= 8 && line.length <= 300)
    .slice(0, 6);
}
