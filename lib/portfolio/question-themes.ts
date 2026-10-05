/** Fixed theme tags for portfolio ask preference signals (no free text stored). */
export const ASK_QUESTION_THEMES = [
  "budget",
  "risk",
  "family_preference",
  "pros_cons",
  "compare",
  "layout",
  "noise_light",
  "parking_transit",
  "decision",
  "other",
] as const;

export type AskQuestionTheme = (typeof ASK_QUESTION_THEMES)[number];

const THEME_PATTERNS: Array<{ theme: Exclude<AskQuestionTheme, "other">; patterns: RegExp[] }> = [
  {
    theme: "budget",
    patterns: [
      /預算|價錢|價格|多少錢|萬以下|萬以內|便宜|貴|afford|budget|price|under\s*\$?\d|cheap|expensive|ราคา|งบ|ถูก|แพง/i,
    ],
  },
  {
    theme: "risk",
    patterns: [
      /潮濕|漏水|發霉|壁癌|風險|噪音|異味|電箱|危|damp|leak|mold|mould|risk|noise|odor|smell|ชื้น|รั่ว|เสี่ยง/i,
    ],
  },
  {
    theme: "family_preference",
    patterns: [
      /媽媽|爸爸|家人|老公|老婆|小孩|誰喜歡|比較喜歡|mom|mum|dad|family|spouse|partner|prefer|ชอบ|แม่|พ่อ|ครอบครัว/i,
    ],
  },
  {
    theme: "pros_cons",
    patterns: [
      /優缺|優點|缺點|pros?|cons?|好處|壞處|整理成重點|สรุป|ข้อดี|ข้อเสีย/i,
    ],
  },
  {
    theme: "compare",
    patterns: [/差在|比較|對照|對比|compare|differ|versus|\bvs\b|ต่าง|เทียบ/i],
  },
  {
    theme: "layout",
    patterns: [/格局|房型|幾房|坪數|面積|layout|bedroom|sqft|sqm|พื้นที่|ห้อง/i],
  },
  {
    theme: "noise_light",
    patterns: [/採光|朝向|光線|太暗|太吵|隔音|light|sunny|facing|quiet|แสง|เงียบ/i],
  },
  {
    theme: "parking_transit",
    patterns: [/停車|車位|捷運|公車|通勤|parking|transit|metro|bus|commute|จอดรถ|รถไฟฟ้า/i],
  },
  {
    theme: "decision",
    patterns: [
      /該買|要不要|淘汰|候選|複看|shortlist|decide|decision|pass|revisit|ตัดสิน|คัดออก/i,
    ],
  },
];

/** Rule-based question themes for analytics signals (zh / en / th keywords). */
export function classifyAskQuestionThemes(question: string): AskQuestionTheme[] {
  const text = question.trim();
  if (!text) return ["other"];

  const matched: AskQuestionTheme[] = [];
  for (const row of THEME_PATTERNS) {
    if (row.patterns.some((re) => re.test(text))) matched.push(row.theme);
  }
  if (matched.length === 0) return ["other"];
  return matched.slice(0, 6);
}
