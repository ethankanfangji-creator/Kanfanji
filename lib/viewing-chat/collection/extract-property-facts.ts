import type {
  ConversationIntent,
  ExtractedPropertyFact,
  ExtractPropertyFactsInput,
  ExtractPropertyFactsResult,
  PropertyFieldId,
  PropertyFactStatus,
} from "./types";

const NUMERIC_FACT_FIELDS = new Set<PropertyFieldId>([
  "price",
  "area",
  "floor",
]);

/** Vague distance / time phrases that must stay as raw wording (no numeric rewrite). */
const VAGUE_TRANSIT_RE =
  /離(?:捷運|地鐵|公交|公車|車站).{0,8}(?:不遠|不近|附近|旁邊|走一下|蠻近|有點遠)|(?:捷運|地鐵).{0,6}(?:不遠|附近|旁邊)|(?:not far|nearby|close to|walking distance).{0,20}(?:mrt|metro|subway|transit|station)/i;

function createFact(input: {
  fieldId: PropertyFieldId;
  value: string | number | boolean | null;
  status: PropertyFactStatus;
  confidence: number;
  sourceMessageId: string | null;
  rawText: string;
}): ExtractedPropertyFact {
  return {
    fieldId: input.fieldId,
    value: input.value,
    status: input.status,
    confidence: clamp01(input.confidence),
    sourceMessageId: input.sourceMessageId,
    rawText: input.rawText.trim(),
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function pickSourceText(input: ExtractPropertyFactsInput): {
  trustedText: string;
  analysisText: string;
  messageId: string | null;
} {
  const parts: string[] = [];
  if (input.transcript?.trim()) parts.push(input.transcript.trim());
  if (input.text?.trim()) parts.push(input.text.trim());

  let messageId = input.messageId?.trim() || null;
  const analysisParts: string[] = [];

  for (const capture of input.captures ?? []) {
    if (capture.text?.trim()) {
      // Photo/video analysis text on the capture itself is still user-adjacent if kind is text/transcript
      if (capture.kind === "text" || capture.kind === "transcript") {
        parts.push(capture.text.trim());
      } else if (capture.kind === "photo" || capture.kind === "video" || capture.kind === "file") {
        // Media OCR / caption only if explicitly provided as text on the capture —
        // treat as inferred later when no trusted user sentence matches.
        parts.push(capture.text.trim());
      }
    }
    if (capture.analysis?.trim()) {
      analysisParts.push(capture.analysis.trim());
    }
    if (!messageId && capture.messageId?.trim()) {
      messageId = capture.messageId.trim();
    }
  }

  return {
    trustedText: parts.join("\n").trim(),
    analysisText: analysisParts.join("\n").trim(),
    messageId,
  };
}

function classifyIntent(
  text: string,
  fields: ExtractedPropertyFact[],
  skipped: PropertyFieldId[],
): ConversationIntent {
  const t = text.trim();
  if (!t) return "other";

  if (
    /整理一下|先這樣|完成|產生報告|出報告|給我摘要|summarize|wrap up|that'?s enough|finish(ed)?\b/i.test(
      t,
    )
  ) {
    return "request_summary";
  }

  if (
    /不知道|不清楚|之後再補|暫時跳過|跳過|略過|先跳過|skip(?:\s+for\s+now)?|don'?t know|not sure|later/i.test(
      t,
    ) ||
    skipped.length > 0
  ) {
    // Pure skip with no other facts
    if (fields.length === 0 || fields.every((f) => f.status === "unknown")) {
      return "defer_skip";
    }
  }

  if (
    /不是.{0,12}是|改成|更正|應該是|搞錯|correction|actually (?:it'?s|its)|not\s+\d+.+\d+/i.test(
      t,
    ) ||
    fields.some((f) => f.status === "corrected")
  ) {
    return "correct";
  }

  if (/[？?]\s*$/.test(t) && fields.length === 0) {
    return "ask_question";
  }

  if (fields.some((f) => f.status === "unknown") && fields.length <= 2) {
    const onlyUnknown = fields.every((f) => f.status === "unknown");
    if (onlyUnknown) return "unknown";
  }

  if (fields.length > 0) return "provide_info";
  return "other";
}

function detectSkippedFields(text: string): PropertyFieldId[] {
  const skipped: PropertyFieldId[] = [];
  const t = text.trim();

  // Explicit area skip
  if (
    /(?:坪數|幾坪|面積|sq\s*ft|square\s*feet?).{0,12}(?:不知道|不清楚|跳過|之後再補|略過)|(?:不知道|不清楚|跳過|之後再補).{0,12}(?:坪數|幾坪|面積)|skip(?:ping)?.{0,12}(?:area|ping|sq\s*ft)|(?:area|ping).{0,12}skip/i.test(
      t,
    )
  ) {
    skipped.push("area");
  }

  // Generic "跳過這題" without field → handled by caller via active focus; here only clear field mentions
  if (
    /(?:價格|開價|總價).{0,8}(?:跳過|之後再補|不知道)|(?:跳過|之後再補).{0,8}(?:價格|開價)/i.test(
      t,
    )
  ) {
    skipped.push("price");
  }

  if (
    /(?:樓層|幾樓).{0,8}(?:跳過|之後再補|不知道)|(?:跳過|之後再補).{0,8}(?:樓層|幾樓)/i.test(
      t,
    )
  ) {
    skipped.push("floor");
  }

  return [...new Set(skipped)];
}

function sliceMatch(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m?.[0]?.trim() || null;
}

function parseWanPrice(raw: string): number | null {
  const m = raw.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*萬/);
  if (m) return Math.round(parseFloat(m[1]) * 10_000);
  const plain = raw.replace(/,/g, "").match(/(\d{5,9})\s*(?:元|塊)?/);
  if (plain) return parseInt(plain[1], 10);
  return null;
}

/**
 * Deterministic, non-hallucinating extractor for unit tests + offline turns.
 * Only emits facts grounded in matched spans; vague phrases stay as rawText/value.
 */
export function extractPropertyFacts(
  input: ExtractPropertyFactsInput,
): ExtractPropertyFactsResult {
  const { trustedText, analysisText, messageId } = pickSourceText(input);
  const fields: ExtractedPropertyFact[] = [];
  const skippedFieldIds = detectSkippedFields(trustedText);

  const pushUnique = (fact: ExtractedPropertyFact) => {
    if (!fact.rawText) return;
    // Do not invent numeric facts without a digit/unit span in rawText
    if (
      NUMERIC_FACT_FIELDS.has(fact.fieldId) &&
      fact.status !== "unknown" &&
      typeof fact.value === "number" &&
      !/\d/.test(fact.rawText)
    ) {
      return;
    }
    const existing = fields.findIndex((f) => f.fieldId === fact.fieldId);
    if (existing >= 0) {
      // Prefer higher confidence / corrected
      if (
        fact.status === "corrected" ||
        fact.confidence >= (fields[existing]?.confidence ?? 0)
      ) {
        fields[existing] = fact;
      }
      return;
    }
    fields.push(fact);
  };

  // --- Corrections (price) ---
  const priceCorrection = trustedText.match(
    /(?:不是|別再寫|改掉)\s*(\d+(?:\.\d+)?)\s*萬?.{0,8}(?:是|改成|改為)\s*(\d+(?:\.\d+)?)\s*萬/,
  );
  if (priceCorrection) {
    const raw = priceCorrection[0];
    const value = parseWanPrice(`${priceCorrection[2]}萬`);
    pushUnique(
      createFact({
        fieldId: "price",
        value: value ?? `${priceCorrection[2]}萬`,
        status: "corrected",
        confidence: 0.95,
        sourceMessageId: messageId,
        rawText: raw,
      }),
    );
  } else {
    const priceAlt = trustedText.match(
      /(?:價格|開價|總價|售價).{0,6}(?:改成|更正為|應該是|是)\s*(\d+(?:\.\d+)?)\s*萬/,
    );
    const priceSimple = trustedText.match(
      /(\d+(?:\.\d+)?)\s*萬(?:元)?(?:\s*[，,。].*)?(?=$)|開價\s*(\d+(?:\.\d+)?)\s*萬|售價\s*(\d+(?:\.\d+)?)\s*萬|總價\s*(\d+(?:\.\d+)?)\s*萬|(\d+(?:\.\d+)?)\s*萬/,
    );
    if (priceAlt) {
      const raw = priceAlt[0];
      const value = parseWanPrice(`${priceAlt[1]}萬`);
      pushUnique(
        createFact({
          fieldId: "price",
          value: value ?? `${priceAlt[1]}萬`,
          status: "confirmed",
          confidence: 0.9,
          sourceMessageId: messageId,
          rawText: raw,
        }),
      );
    } else if (priceSimple && !/不是/.test(trustedText)) {
      const digits =
        priceSimple[1] ||
        priceSimple[2] ||
        priceSimple[3] ||
        priceSimple[4] ||
        priceSimple[5];
      if (digits) {
        const raw = sliceMatch(trustedText, /\d+(?:\.\d+)?\s*萬/) || priceSimple[0];
        const value = parseWanPrice(`${digits}萬`);
        pushUnique(
          createFact({
            fieldId: "price",
            value: value ?? `${digits}萬`,
            status: "confirmed",
            confidence: 0.88,
            sourceMessageId: messageId,
            rawText: raw,
          }),
        );
      }
    }
  }

  // --- Address ---
  const addressMatch = trustedText.match(
    /(?:地址[：:：\s]*)([^\n，。；;]{4,40})|(?:在|位於)\s*([^\n，。；;]{4,40}?(?:路|街|巷|弄|號|區|市|縣|大道)[^\n，。；;]{0,20})/,
  );
  if (addressMatch) {
    const value = (addressMatch[1] || addressMatch[2] || "").trim();
    if (value) {
      pushUnique(
        createFact({
          fieldId: "address",
          value,
          status: "confirmed",
          confidence: 0.9,
          sourceMessageId: messageId,
          rawText: addressMatch[0].trim(),
        }),
      );
    }
  }

  // --- Layout ---
  const layoutMatch = trustedText.match(
    /(\d+\s*房\s*\d+\s*廳(?:\s*\d+\s*衛)?)|(\d+\s*房(?:\s*\d+\s*衛)?)|((?:兩|二|三|四|五)\s*房(?:\s*(?:一|兩|二)\s*廳)?)|(\d+\s*bed(?:room)?s?(?:\s*\/?\s*\d+\s*bath)?)/i,
  );
  if (layoutMatch) {
    pushUnique(
      createFact({
        fieldId: "layout",
        value: layoutMatch[0].replace(/\s+/g, ""),
        status: "confirmed",
        confidence: 0.9,
        sourceMessageId: messageId,
        rawText: layoutMatch[0],
      }),
    );
  }

  // --- Area (only with explicit number + unit) ---
  const areaMatch = trustedText.match(
    /(\d+(?:\.\d+)?)\s*坪|(?:約|大概)?\s*(\d+(?:\.\d+)?)\s*(?:平方英尺|sq\s*ft|sqft)/i,
  );
  if (areaMatch && !skippedFieldIds.includes("area")) {
    const n = parseFloat(areaMatch[1] || areaMatch[2]);
    pushUnique(
      createFact({
        fieldId: "area",
        value: Number.isFinite(n) ? n : areaMatch[0],
        status: "confirmed",
        confidence: 0.9,
        sourceMessageId: messageId,
        rawText: areaMatch[0],
      }),
    );
  }

  // Skipped / unknown area
  if (skippedFieldIds.includes("area")) {
    pushUnique(
      createFact({
        fieldId: "area",
        value: null,
        status: "unknown",
        confidence: 0.2,
        sourceMessageId: messageId,
        rawText: sliceMatch(
          trustedText,
          /(?:坪數|幾坪|面積).{0,12}(?:不知道|不清楚|跳過|之後再補)|(?:不知道|不清楚|跳過|之後再補).{0,12}(?:坪數|幾坪|面積)|skip.{0,12}area|area.{0,12}skip/i,
        ) || "坪數跳過",
      }),
    );
  }

  // --- Floor (only explicit) ---
  const floorMatch = trustedText.match(/(\d+)\s*樓|樓層\s*(\d+)|(\d+)\s*F\b/i);
  if (floorMatch) {
    const n = parseInt(floorMatch[1] || floorMatch[2] || floorMatch[3], 10);
    pushUnique(
      createFact({
        fieldId: "floor",
        value: n,
        status: "confirmed",
        confidence: 0.9,
        sourceMessageId: messageId,
        rawText: floorMatch[0],
      }),
    );
  }

  // --- Transit: keep vague wording; never invent walk minutes ---
  const vagueTransit = sliceMatch(trustedText, VAGUE_TRANSIT_RE);
  if (vagueTransit) {
    pushUnique(
      createFact({
        fieldId: "transit",
        value: vagueTransit,
        status: "confirmed",
        confidence: 0.7,
        sourceMessageId: messageId,
        rawText: vagueTransit,
      }),
    );
  }

  const preciseTransit = trustedText.match(
    /(?:步行|走路|騎車)?\s*(\d+)\s*分鐘.{0,6}(?:捷運|地鐵|車站)|(?:捷運|地鐵).{0,6}(?:步行|走路)?\s*(\d+)\s*分鐘/,
  );
  if (preciseTransit && !vagueTransit) {
    pushUnique(
      createFact({
        fieldId: "transit",
        value: preciseTransit[0].trim(),
        status: "confirmed",
        confidence: 0.9,
        sourceMessageId: messageId,
        rawText: preciseTransit[0].trim(),
      }),
    );
  }

  // --- Noise (can appear mid-answer about something else) ---
  const noiseMatch = trustedText.match(
    /(?:噪音|吵|吵雜|高架|車流聲|很吵|有點吵|安靜)[^\n，。]{0,24}|陽台外有高架[^。\n]{0,20}/,
  );
  if (noiseMatch) {
    pushUnique(
      createFact({
        fieldId: "noise",
        value: noiseMatch[0].trim(),
        status: "confirmed",
        confidence: 0.86,
        sourceMessageId: messageId,
        rawText: noiseMatch[0].trim(),
      }),
    );
  }

  // --- Pros / cons ---
  const prosMatch = trustedText.match(
    /(?:優點|好處|喜歡)[：:：\s]*([^。\n；;]+)|採光(?:不錯|很好|佳)/,
  );
  if (prosMatch) {
    const raw = prosMatch[0].trim();
    const value = (prosMatch[1] || raw).trim();
    pushUnique(
      createFact({
        fieldId: "pros",
        value,
        status: "confirmed",
        confidence: 0.85,
        sourceMessageId: messageId,
        rawText: raw,
      }),
    );
  }

  const consMatch = trustedText.match(
    /(?:缺點|疑慮|風險|不好)[：:：\s]*([^。\n；;]+)|(?:屋齡偏老|壁癌|漏水)/,
  );
  if (consMatch) {
    const raw = consMatch[0].trim();
    const value = (consMatch[1] || raw).trim();
    pushUnique(
      createFact({
        fieldId: "cons",
        value,
        status: "confirmed",
        confidence: 0.85,
        sourceMessageId: messageId,
        rawText: raw,
      }),
    );
  }

  // --- Light as separate signal when mentioned with 採光 ---
  if (/採光/.test(trustedText) && !fields.some((f) => f.fieldId === "light")) {
    const lightSpan = sliceMatch(trustedText, /採光[^。\n]{0,12}/);
    if (lightSpan) {
      pushUnique(
        createFact({
          fieldId: "light",
          value: lightSpan,
          status: "confirmed",
          confidence: 0.8,
          sourceMessageId: messageId,
          rawText: lightSpan,
        }),
      );
    }
  }

  // --- Inferred-only from untrusted analysis (no numeric invention) ---
  if (analysisText) {
    if (/霉|霉味|musty|mold/i.test(analysisText) && !fields.some((f) => f.fieldId === "odor")) {
      const raw = sliceMatch(analysisText, /.{0,8}(?:霉|味|musty|mold).{0,8}/i) || analysisText.slice(0, 40);
      pushUnique(
        createFact({
          fieldId: "odor",
          value: raw,
          status: "inferred",
          confidence: 0.35,
          sourceMessageId: messageId,
          rawText: raw,
        }),
      );
    }
    // Explicitly do NOT parse price/area/floor from analysis alone
  }

  // Mark skipped price/floor as unknown if requested
  for (const id of skippedFieldIds) {
    if (id === "area") continue; // already handled
    if (!fields.some((f) => f.fieldId === id)) {
      pushUnique(
        createFact({
          fieldId: id,
          value: null,
          status: "unknown",
          confidence: 0.2,
          sourceMessageId: messageId,
          rawText: trustedText.slice(0, 80) || String(id),
        }),
      );
    }
  }

  const intent = classifyIntent(trustedText, fields, skippedFieldIds);

  return {
    fields,
    intent,
    sourceText: trustedText,
    skippedFieldIds,
  };
}
