/**
 * Explicit (A) collection: short answers to focus questions.
 * Defers to dialogue-strategy for vague / yes-no (招1 / 招3).
 */

import {
  isVagueUtterance,
  isYesUtterance,
  isNoUtterance,
} from "./dialogue-strategy";
import type { ExtractedPropertyFact, PropertyFieldId } from "./types";

const SHORT_ANSWER_MAX = 72;

/** Don't dump transit/price-like answers into the wrong soft-focus slot. */
function textConflictsWithFocus(focus: PropertyFieldId, text: string): boolean {
  if (
    focus !== "transit" &&
    /(?:捷運|地鐵|公交|公車|公車站|走路|步行).{0,8}分/.test(text)
  ) {
    return true;
  }
  if (
    focus !== "price" &&
    focus !== "area" &&
    /\d+\s*萬|\d+\s*坪|\d+房/.test(text)
  ) {
    return true;
  }
  if (
    (focus === "amenities" || focus === "parking") &&
    /(?:公車站|捷運|地鐵|公交).{0,12}(?:走路|步行|分鐘)/.test(text)
  ) {
    return true;
  }
  return false;
}

function createFact(
  fieldId: PropertyFieldId,
  value: string,
  messageId: string | null,
  confidence: number,
): ExtractedPropertyFact {
  return {
    fieldId,
    value,
    status: "confirmed",
    confidence,
    sourceMessageId: messageId,
    rawText: value,
  };
}

/**
 * Returns a focus fill when the utterance looks like a direct answer to the
 * soft question we just asked — not when the user is volunteering multi-field notes.
 */
export function fillFocusSlot(input: {
  text: string;
  focusFieldIds: PropertyFieldId[];
  messageId?: string | null;
  /** True when rule/LLM extract already found structured fields */
  alreadyExtractedFieldIds?: PropertyFieldId[];
}): ExtractedPropertyFact[] {
  const focus = input.focusFieldIds[0];
  if (!focus) return [];

  const text = input.text.trim();
  if (!text) return [];

  // 招3 / 招1 — handled elsewhere (vague + yes/no confirm)
  if (isVagueUtterance(text) || isYesUtterance(text) || isNoUtterance(text)) {
    return [];
  }

  // Don't steal multi-fact freeform turns (Implicit B)
  if (
    input.alreadyExtractedFieldIds &&
    input.alreadyExtractedFieldIds.some((id) => id !== focus)
  ) {
    return [];
  }
  if (input.alreadyExtractedFieldIds?.includes(focus)) {
    return [];
  }

  // Too long / multi-clause → treat as freeform, not explicit slot answer
  if (text.length > SHORT_ANSWER_MAX) return [];
  if (/[。！？\n]/.test(text) && text.length > 40) return [];
  if (textConflictsWithFocus(focus, text)) return [];
  if (
    /\d+\s*萬|\d+\s*坪|\d+房|優點|缺點|開價|格局|地址/.test(text) &&
    focus !== "price" &&
    focus !== "area" &&
    focus !== "layout"
  ) {
    return [];
  }

  // Skip / don't-know handled elsewhere
  if (
    /^(跳過|略過|不知道|不清楚|之後再補|skip|don'?t know|not sure)[.。!！…]*$/i.test(
      text,
    )
  ) {
    return [];
  }

  return [createFact(focus, text, input.messageId ?? null, 0.92)];
}
