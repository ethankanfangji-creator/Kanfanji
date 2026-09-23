import type { Locale } from "@/lib/i18n/config";
import { createAiMessage, type ChatMessage } from "@/lib/viewing-chat/types";

/** Opening AI prompts shown in chat after address confirm (UI locale = device language). */
export function buildOpeningQuestions(address: string, locale: Locale): ChatMessage[] {
  const lines =
    locale === "en"
      ? [
          `We're at ${address}. I'll ask on-site questions here — answer with text, voice, or photos.`,
          "1. Electrical panel brand / amperage?",
          "2. Any leaks or water stains?",
          "3. Noise sources (neighbors / street / HVAC)?",
          "4. Light / orientation enough?",
          "5. Strata / special fees / taxes?",
          "6. What else should we ask the seller or agent?",
        ]
      : locale === "th"
        ? [
            `เราอยู่ที่ ${address} ฉันจะถามคำถามหน้างานในแชทนี้ — ตอบด้วยข้อความ เสียง หรือรูปได้`,
            "1. ตู้ไฟยี่ห้อ / แอมป์?",
            "2. มีรอยรั่วหรือคราบน้ำไหม?",
            "3. แหล่งเสียงรบกวน (เพื่อนบ้าน / ถนน / HVAC)?",
            "4. แสง / ทิศทางเพียงพอไหม?",
            "5. ค่าส่วนกลาง / ค่าพิเศษ / ภาษี?",
            "6. ยังควรถามผู้ขายหรือนายหน้าอะไรอีก?",
          ]
        : locale === "zh-Hans"
          ? [
              `已确认地址：${address}。我会在对话里直接提问，请用文字、语音或照片回答。`,
              "1. 电箱品牌／安培数？",
              "2. 有无漏水／水渍？",
              "3. 噪音来源？（邻居／马路／HVAC）",
              "4. 采光／朝向够不够？",
              "5. 管理费／特别费／税金？",
              "6. 还要追问卖方／中介什么？",
            ]
          : [
              `已確認地址：${address}。我會在對話裡直接提問，請用文字、語音或照片回答。`,
              "1. 電箱廠牌／安培數？",
              "2. 有無漏水／水漬？",
              "3. 噪音來源？（鄰居／馬路／HVAC）",
              "4. 採光／朝向夠不夠？",
              "5. 管理費／特別費／稅金？",
              "6. 還要追問賣方／仲介什麼？",
            ];

  return [
    createAiMessage({
      type: "follow_up",
      text: lines.join("\n"),
    }),
  ];
}
