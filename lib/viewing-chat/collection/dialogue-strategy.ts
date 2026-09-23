/**
 * Dialogue strategies to keep users talking:
 * 1) Confirm Yes/No → slot
 * 2) Multi-slot one question
 * 3) Vague utterance → low confidence + clarify
 * 4) Progressive depth by user-turn index
 */

import { FIELD_CATALOG, getCatalogEntry, questionForField } from "./field-catalog";
import type {
  ExtractedPropertyFact,
  PropertyCollectionRecord,
  PropertyFieldId,
} from "./types";

export type DepthBand = "condition" | "livability" | "geo";

/** 招4 — depth bands (1-indexed user turns: 1–3 / 4–6 / 7+) */
export const DEPTH_FIELDS: Record<DepthBand, PropertyFieldId[]> = {
  condition: [
    "electrical",
    "water_damage",
    "plumbing",
    "hvac",
    "amenities",
    "floor",
    "layout",
  ],
  livability: ["odor", "noise", "light", "pros", "cons", "parking"],
  geo: ["transit", "year_built", "price", "area", "address"],
};

export type PendingConfirm = {
  fieldId: PropertyFieldId;
  candidateValue: string;
  source: "vision" | "intel" | "assistant_guess" | "inferred";
};

export type SuggestedQuestionKind =
  | "open"
  | "confirm"
  | "clarify"
  | "composite";

const VAGUE_RE =
  /^(還好|普通|還可以|一般|就那樣|馬馬虎虎|還行|不錯吧|ok|okay|fine|so[- ]?so|alright|whatever)[.。!！…]*$/i;

export function isVagueUtterance(text: string): boolean {
  return VAGUE_RE.test(text.trim());
}

const YES_RE =
  /^(對|是|對啊|對的|是的|沒錯|嗯|對唷|好|yes|yep|yeah|correct|right)[.。!！…]*$/i;
const NO_RE =
  /^(不|不是|不對|錯|沒有|否|no|nope|wrong)[.。!！…]*$/i;

/** Leading yes/no before more content:「不對，沒有公設」— not bare「沒有公設」. */
const LEADING_YES_RE =
  /^(對啊?|對的|是的|沒錯|好的|yes|yep|yeah|correct|right)([，,。.\s！!…]|$)/i;
const LEADING_NO_RE =
  /^(不對啊?|不是|不對|錯了|錯的|nope|wrong|no)([，,。.\s！!…]|$)/i;

export function isYesUtterance(text: string): boolean {
  return YES_RE.test(text.trim());
}

export function isNoUtterance(text: string): boolean {
  return NO_RE.test(text.trim());
}

export function splitLeadingYesNo(text: string): {
  verdict: "yes" | "no" | null;
  remainder: string;
} {
  const raw = text.trim();
  if (!raw) return { verdict: null, remainder: "" };
  if (isYesUtterance(raw)) return { verdict: "yes", remainder: "" };
  if (isNoUtterance(raw)) return { verdict: "no", remainder: "" };

  const yes = raw.match(LEADING_YES_RE);
  if (yes) {
    return {
      verdict: "yes",
      remainder: raw.slice(yes[0].length).trim(),
    };
  }
  const no = raw.match(LEADING_NO_RE);
  if (no) {
    return {
      verdict: "no",
      remainder: raw.slice(no[0].length).trim(),
    };
  }
  return { verdict: null, remainder: raw };
}

/** 招4 — map 1-based user turn count → depth band */
export function depthBandForTurn(userTurnCount: number): DepthBand {
  if (userTurnCount <= 3) return "condition";
  if (userTurnCount <= 6) return "livability";
  return "geo";
}

/** Fields allowed at this turn (current band + earlier bands still open). */
export function allowedFieldsForDepth(userTurnCount: number): Set<PropertyFieldId> {
  const band = depthBandForTurn(userTurnCount);
  const order: DepthBand[] = ["condition", "livability", "geo"];
  const idx = order.indexOf(band);
  const allowed = new Set<PropertyFieldId>();
  for (let i = 0; i <= idx; i++) {
    for (const id of DEPTH_FIELDS[order[i]!]) allowed.add(id);
  }
  return allowed;
}

/** Prefer current band; fall back to earlier if empty. */
export function preferredFieldsForDepth(userTurnCount: number): Set<PropertyFieldId> {
  return new Set(DEPTH_FIELDS[depthBandForTurn(userTurnCount)]);
}

export function clarifyQuestionForField(
  fieldId: PropertyFieldId,
  locale = "zh-Hant",
): string {
  const en = locale.startsWith("en");
  const map: Record<string, { zh: string; en: string }> = {
    water_damage: {
      zh: "還好是指沒有漏水／水漬，還是剛整修過看起來還好？",
      en: "Does “fine” mean no leaks/stains, or that it was recently renovated?",
    },
    amenities: {
      zh: "還好是指廚房／浴室有翻新，還是設備大致堪用？",
      en: "Does “fine” mean renovated kitchen/bath, or just usable equipment?",
    },
    odor: {
      zh: "還好是指沒異味，還是只有一點點味道？",
      en: "Does “fine” mean no odor, or just a slight smell?",
    },
    noise: {
      zh: "還好是指算安靜，還是有一點車流／鄰居聲但不嚴重？",
      en: "Does “fine” mean fairly quiet, or mild traffic/neighbour noise?",
    },
    electrical: {
      zh: "還好是指電箱看起來正常，還是品牌／安培你還沒看清楚？",
      en: "Does “fine” mean the panel looks ok, or you haven’t checked the brand yet?",
    },
    light: {
      zh: "還好是指白天夠亮，還是只有部分房間採光ok？",
      en: "Does “fine” mean bright enough overall, or only some rooms?",
    },
    plumbing: {
      zh: "還好是指水壓夠、排水順，還是只有勉強可用？",
      en: "Does “fine” mean good pressure/drainage, or just barely usable?",
    },
  };
  const hit = map[fieldId];
  if (hit) return en ? hit.en : hit.zh;
  return en
    ? `When you say “fine”, what do you mean about ${fieldId}?`
    : `你說的「還好」是指哪一方面？（關於${getCatalogEntry(fieldId)?.questionZh ?? fieldId}）`;
}

/** 招1 — confirm question from inferred / candidate */
export function confirmQuestion(
  pending: PendingConfirm,
  locale = "zh-Hant",
): string {
  const label = fieldLabel(pending.fieldId, locale);
  const val = String(pending.candidateValue);
  if (locale.startsWith("en")) {
    return `About ${label}: does “${val}” look right? (yes / no is enough)`;
  }
  return `剛那個${label}看起來像「${val}」，是這個嗎？（回「對」或「不是」就好）`;
}

function fieldLabel(fieldId: PropertyFieldId, locale: string): string {
  const entry = getCatalogEntry(fieldId);
  if (!entry) return String(fieldId);
  if (locale.startsWith("en")) {
    return fieldId;
  }
  const zh: Record<string, string> = {
    electrical: "電箱",
    water_damage: "水損／漏水",
    odor: "氣味",
    noise: "噪音",
    amenities: "設備／翻新",
    plumbing: "水路／水壓",
    layout: "格局",
    light: "採光",
    year_built: "建年",
    transit: "交通",
  };
  return zh[fieldId] ?? entry.questionZh.replace(/？|\?/g, "");
}

/** 招2 — composite question groups (ask together when several gaps) */
export const COMPOSITE_GROUPS: PropertyFieldId[][] = [
  ["amenities", "water_damage", "plumbing"],
  ["odor", "noise"],
  ["electrical", "water_damage"],
  ["light", "layout"],
  ["pros", "cons"],
];

export function compositeQuestion(
  fieldIds: PropertyFieldId[],
  locale = "zh-Hant",
): string {
  const key = fieldIds.slice().sort().join("+");
  const en = locale.startsWith("en");
  const presets: Record<string, { zh: string; en: string }> = {
    "amenities+plumbing+water_damage": {
      zh: "廚房和浴室有翻新嗎？有沒有漏水／水漬？水壓還好嗎？",
      en: "Any kitchen/bath renovations? Leaks or stains? How’s water pressure?",
    },
    "noise+odor": {
      zh: "進門氣味跟現場噪音大概怎樣？",
      en: "How are the entry smell and on-site noise?",
    },
    "electrical+water_damage": {
      zh: "電箱看起來正常嗎？有沒有看到水漬或壁癌？",
      en: "Does the electrical panel look ok? Any water stains or mold?",
    },
    "layout+light": {
      zh: "格局大概幾房？採光通風感覺如何？",
      en: "Rough layout (beds)? How are light and airflow?",
    },
    "cons+pros": {
      zh: "目前覺得優點跟缺點各有哪些？",
      en: "What pros and cons stand out so far?",
    },
  };
  if (presets[key]) return en ? presets[key]!.en : presets[key]!.zh;
  const parts = fieldIds.map((id) => questionForField(id, locale));
  return en
    ? parts.join(" Also: ")
    : parts.map((p) => p.replace(/？$/, "")).join("？另外，") + "？";
}

/**
 * 招1 — resolve yes/no against pendingConfirm.
 * Supports「不對，沒有公設」: reject pending, leave remainder for freeform extract.
 */
export function resolvePendingConfirm(input: {
  text: string;
  pending: PendingConfirm | null | undefined;
  messageId: string | null;
}): {
  facts: ExtractedPropertyFact[];
  clearPending: boolean;
  rejected: boolean;
  /** Text after a leading yes/no — continue extract on this */
  remainder: string;
} {
  if (!input.pending) {
    return {
      facts: [],
      clearPending: false,
      rejected: false,
      remainder: input.text.trim(),
    };
  }
  const { verdict, remainder } = splitLeadingYesNo(input.text);
  if (verdict === "yes") {
    return {
      facts: [
        {
          fieldId: input.pending.fieldId,
          value: input.pending.candidateValue,
          status: "confirmed",
          confidence: 0.95,
          sourceMessageId: input.messageId,
          rawText: input.text.trim(),
        },
      ],
      clearPending: true,
      rejected: false,
      remainder,
    };
  }
  if (verdict === "no") {
    return {
      facts: [
        {
          fieldId: input.pending.fieldId,
          value: null,
          status: "unknown",
          confidence: 0.2,
          sourceMessageId: input.messageId,
          rawText: input.text.trim(),
        },
      ],
      clearPending: true,
      rejected: true,
      remainder,
    };
  }
  return {
    facts: [],
    clearPending: false,
    rejected: false,
    remainder: input.text.trim(),
  };
}

/**
 * 招3 — vague answer: store low-confidence placeholder, do not treat as confirmed fill.
 */
export function vagueFocusFact(input: {
  text: string;
  focusFieldIds: PropertyFieldId[];
  messageId: string | null;
}): ExtractedPropertyFact | null {
  if (!isVagueUtterance(input.text)) return null;
  const focus = input.focusFieldIds[0];
  if (!focus) return null;
  return {
    fieldId: focus,
    value: input.text.trim(),
    status: "inferred",
    confidence: 0.2,
    sourceMessageId: input.messageId,
    rawText: input.text.trim(),
  };
}

/** Pick best inferred field on record to propose as Yes/No confirm. */
export function pickPendingConfirmFromRecord(
  record: PropertyCollectionRecord,
  preferredFieldIds?: PropertyFieldId[],
): PendingConfirm | null {
  const prefer = preferredFieldIds?.length
    ? preferredFieldIds
    : FIELD_CATALOG.map((e) => e.fieldId);
  for (const id of prefer) {
    const f = record.fields[id];
    if (
      f &&
      f.status === "inferred" &&
      f.value != null &&
      f.value !== "" &&
      !f.hasConflict
    ) {
      return {
        fieldId: id,
        candidateValue: String(f.value),
        source: "inferred",
      };
    }
  }
  return null;
}
