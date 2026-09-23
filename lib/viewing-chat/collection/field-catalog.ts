import type { PropertyFieldId } from "./types";

export type FieldValueKind = "fact" | "subjective";

export type FieldCatalogEntry = {
  fieldId: PropertyFieldId;
  /** Higher = ask sooner when missing */
  importance: number;
  /** fact = listing/measurement; subjective = on-site feel / opinion */
  valueKind: FieldValueKind;
  questionZh: string;
  questionEn: string;
};

/**
 * Importance ranking for gap-driven follow-ups (not a fixed dialogue order).
 */
export const FIELD_CATALOG: FieldCatalogEntry[] = [
  {
    fieldId: "address",
    importance: 100,
    valueKind: "fact",
    questionZh: "這間房子的地址是？",
    questionEn: "What is the property address?",
  },
  {
    fieldId: "price",
    importance: 95,
    valueKind: "fact",
    questionZh: "開價或心理價大約多少？",
    questionEn: "What is the asking or target price?",
  },
  {
    fieldId: "area",
    importance: 90,
    valueKind: "fact",
    questionZh: "大約幾坪（或多少平方英尺）？不知道也可以之後再補。",
    questionEn: "About how many ping / sq ft? You can skip if unsure.",
  },
  {
    fieldId: "layout",
    importance: 85,
    valueKind: "fact",
    questionZh: "格局是幾房幾廳？",
    questionEn: "What is the layout (beds / baths)?",
  },
  {
    fieldId: "floor",
    importance: 78,
    valueKind: "fact",
    questionZh: "樓層是幾樓？",
    questionEn: "Which floor is the unit on?",
  },
  {
    fieldId: "noise",
    importance: 82,
    valueKind: "subjective",
    questionZh: "現場噪音如何？（車流／高架／鄰居）",
    questionEn: "How is the on-site noise (traffic / elevated road / neighbours)?",
  },
  {
    fieldId: "odor",
    importance: 80,
    valueKind: "subjective",
    questionZh: "進門氣味如何？",
    questionEn: "How does it smell when you walk in?",
  },
  {
    fieldId: "water_damage",
    importance: 88,
    valueKind: "fact",
    questionZh: "有沒有看到水漬、壁癌或滲漏？",
    questionEn: "Any water stains, mold, or leaks?",
  },
  {
    fieldId: "electrical",
    importance: 84,
    valueKind: "fact",
    questionZh: "電箱廠牌／安培看起來如何？",
    questionEn: "Electrical panel brand / amperage?",
  },
  {
    fieldId: "year_built",
    importance: 72,
    valueKind: "fact",
    questionZh: "屋齡或建年大概多少？（可保留推測）",
    questionEn: "About what year was it built? (guesses ok as inferred)",
  },
  {
    fieldId: "transit",
    importance: 70,
    valueKind: "fact",
    questionZh: "到捷運／公交大概多遠？（可保留你自己的說法）",
    questionEn: "How far to transit? Keep your own wording if unsure.",
  },
  {
    fieldId: "pros",
    importance: 55,
    valueKind: "subjective",
    questionZh: "目前覺得優點有哪些？",
    questionEn: "What pros stand out so far?",
  },
  {
    fieldId: "cons",
    importance: 60,
    valueKind: "subjective",
    questionZh: "目前覺得缺點或疑慮有哪些？",
    questionEn: "What cons or concerns stand out?",
  },
  {
    fieldId: "light",
    importance: 65,
    valueKind: "subjective",
    questionZh: "採光與通風如何？",
    questionEn: "How are light and airflow?",
  },
  {
    fieldId: "parking",
    importance: 50,
    valueKind: "fact",
    questionZh: "車位／停車方便嗎？",
    questionEn: "Is parking available / convenient?",
  },
  {
    fieldId: "amenities",
    importance: 40,
    valueKind: "fact",
    questionZh: "有哪些設備或公設？",
    questionEn: "Any notable amenities or equipment?",
  },
];

export function getCatalogEntry(
  fieldId: PropertyFieldId,
): FieldCatalogEntry | undefined {
  return FIELD_CATALOG.find((e) => e.fieldId === fieldId);
}

export function questionForField(
  fieldId: PropertyFieldId,
  locale = "zh-Hant",
): string {
  const entry = getCatalogEntry(fieldId);
  if (!entry) return locale.startsWith("en") ? `About ${fieldId}?` : `關於${fieldId}？`;
  return locale.startsWith("en") ? entry.questionEn : entry.questionZh;
}
