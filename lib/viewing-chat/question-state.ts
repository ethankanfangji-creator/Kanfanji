export type QuestionState = {
  answered: Record<string, string>;
  askedCount: Record<string, number>;
};

export const HOUSE_QUESTION_KEYS = [
  "odor",
  "water_damage",
  "layout",
  "noise",
  "price",
  "area",
  "year_built",
  "floor",
  "light",
  "parking",
  "roof_storage",
  "roof_material",
] as const;

const LABELS: Record<string, { "zh-Hant": string; en: string }> = {
  odor: { "zh-Hant": "氣味", en: "smell" },
  water_damage: { "zh-Hant": "水損", en: "water damage" },
  layout: { "zh-Hant": "格局", en: "layout" },
  noise: { "zh-Hant": "噪音", en: "noise" },
  price: { "zh-Hant": "價格", en: "price" },
  area: { "zh-Hant": "坪數", en: "size" },
  year_built: { "zh-Hant": "年份", en: "year built" },
  floor: { "zh-Hant": "樓層", en: "floor" },
  light: { "zh-Hant": "採光", en: "light" },
  parking: { "zh-Hant": "車位", en: "parking" },
  roof_storage: { "zh-Hant": "屋頂收納", en: "roof storage" },
  roof_material: { "zh-Hant": "屋頂材料", en: "roof material" },
};

const QUESTIONS: Record<string, { "zh-Hant": string; en: string }> = {
  odor: { "zh-Hant": "進門氣味如何？", en: "How does it smell inside?" },
  water_damage: { "zh-Hant": "有沒有看到壁癌或漏水？", en: "Any signs of leaks?" },
  layout: { "zh-Hant": "格局是幾房幾廳？", en: "What is the layout?" },
  noise: { "zh-Hant": "周圍安不安靜？", en: "How quiet is it?" },
  price: { "zh-Hant": "開價大約多少？", en: "What is the asking price?" },
  area: { "zh-Hant": "大約幾坪？", en: "About how large is it?" },
  year_built: { "zh-Hant": "大概哪一年蓋的？", en: "About what year was it built?" },
  floor: { "zh-Hant": "在幾樓？", en: "Which floor?" },
  light: { "zh-Hant": "採光怎麼樣？", en: "How is the light?" },
  parking: { "zh-Hant": "車位方便嗎？", en: "How is parking?" },
  roof_storage: { "zh-Hant": "屋頂或閣樓收納夠嗎？", en: "Is there storage under the roof?" },
  roof_material: { "zh-Hant": "屋頂是什麼材料？", en: "What is the roof made of?" },
};

export function emptyQuestionState(): QuestionState {
  return { answered: {}, askedCount: {} };
}

export function labelForKey(key: string, language: string): string {
  const row = LABELS[key];
  if (!row) return language.startsWith("en") ? "that" : "這一項";
  return language.startsWith("en") ? row.en : row["zh-Hant"];
}

export function questionForKey(key: string, language: string): string {
  const row = QUESTIONS[key];
  if (!row) return language.startsWith("en") ? "Anything else you noticed?" : "還有看到什麼嗎？";
  return language.startsWith("en") ? row.en : row["zh-Hant"];
}

/** Each key is asked at most once, and never after it is answered. */
export function filterAskableKeys(keys: readonly string[], state: QuestionState): string[] {
  return keys.filter((key) => {
    const value = state.answered[key];
    if (typeof value === "string" && value.trim()) return false;
    return (state.askedCount[key] ?? 0) < 1;
  });
}

export function markAsked(state: QuestionState, key: string): QuestionState {
  if ((state.askedCount[key] ?? 0) >= 1) return state;
  return {
    answered: state.answered,
    askedCount: { ...state.askedCount, [key]: 1 },
  };
}

export function markAnswered(state: QuestionState, key: string, value: string): QuestionState {
  const text = value.trim();
  if (!text) return state;
  return {
    answered: { ...state.answered, [key]: text },
    askedCount: { ...state.askedCount, [key]: 1 },
  };
}

/** User-facing text must not contain snake_case keys or mixed English field names. */
export function stripInternalKeys(text: string, language: string): string {
  let next = text;
  for (const key of Object.keys(LABELS)) {
    next = next.replaceAll(key, labelForKey(key, language));
  }
  next = next.replace(/\b[a-z]+(?:_[a-z0-9]+)+\b/g, (key) => labelForKey(key, language));
  if (!language.startsWith("en")) {
    next = next.replace(/water damage/gi, "水損");
    next = next.replace(/roof storage/gi, "屋頂收納");
    next = next.replace(/roof material/gi, "屋頂材料");
  }
  return next;
}
