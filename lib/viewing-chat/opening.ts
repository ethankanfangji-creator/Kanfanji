/**
 * Opening AI bubble after address confirm — natural dialogue, not a quiz list.
 * Seeds one soft focus field for Explicit (A) collection.
 */

import type { Locale } from "@/lib/i18n/config";
import { createAiMessage, type ChatMessage } from "@/lib/viewing-chat/types";
import type { PropertyFieldId } from "@/lib/viewing-chat/collection/types";
import { questionForField } from "@/lib/viewing-chat/collection/field-catalog";

/** First soft focus after address — high-value on-site cue, skippable. */
export const OPENING_FOCUS_FIELD: PropertyFieldId = "odor";

export type OpeningBubbleResult = {
  message: ChatMessage;
  focusFieldIds: PropertyFieldId[];
};

/**
 * One composition: brand the assistant role, invite free talk (B),
 * one optional explicit cue (A), mention photo/address helpers (C).
 */
export function buildOpeningBubble(
  address: string,
  locale: Locale | string,
): OpeningBubbleResult {
  const focus = OPENING_FOCUS_FIELD;
  const focusQ = questionForField(focus, String(locale));
  const loc = String(locale);

  const text =
    loc.startsWith("en")
      ? [
          `We're at ${address}. I'm your viewing note-taker — not an agent or appraiser.`,
          "Say anything you notice in any order (text, voice, or photos). I'll file what I can in the background.",
          `If useful: ${focusQ} — or skip and talk about something else.`,
          "Photos and the address may add unverified hints (marked as inferred). You finish when you feel done — not when every field is full.",
        ].join("\n\n")
      : loc.startsWith("th")
        ? [
            `เราอยู่ที่ ${address} ฉันช่วยจดบันทึกการดูบ้าน — ไม่ใช่นายหน้าหรือผู้ประเมิน`,
            "พูดสิ่งที่เห็นได้ตามลำดับใดก็ได้ (ข้อความ เสียง หรือรูป) ฉันจะจัดเก็บเบื้องหลัง",
            `ถ้าสะดวก: ${focusQ} — หรือข้ามแล้วคุยอย่างอื่นได้`,
            "รูปและที่อยู่อาจเติมข้อมูลแบบคาดการณ์ (ติดป้าย inferred) จบเมื่อคุณพร้อม ไม่ต้องกรอกครบทุกช่อง",
          ].join("\n\n")
        : loc.includes("Hans")
          ? [
              `已确认地址：${address}。我是看房纪录助理，不是中介或估价师。`,
              "你想到什么就说什么（文字、语音或照片），我会在背后整理进摘要，不会逼你按表填写。",
              `若方便可先提一句：${focusQ}——跳过、换话题都没问题。`,
              "照片与地址情报可能自动补上「推测」栏位，需你确认后才算已确认。觉得可以结束时再说「整理一下／完成」即可。",
            ].join("\n\n")
          : [
              `已確認地址：${address}。我是看房紀錄助理，不是房仲或估價師。`,
              "你想到什麼就說什麼（文字、語音或照片），我會在背後整理進摘要，不會逼你按表填寫。",
              `若方便可先提一句：${focusQ}——跳過、換話題都沒問題。`,
              "照片與地址情報可能自動補上「推測」欄位，需你確認後才算已確認。覺得可以結束時再說「整理一下／完成」即可。",
            ].join("\n\n");

  return {
    message: createAiMessage({
      type: "follow_up",
      text,
    }),
    focusFieldIds: [focus],
  };
}

/** @deprecated Use buildOpeningBubble — kept for any legacy callers */
export function buildOpeningQuestions(address: string, locale: Locale): ChatMessage[] {
  return [buildOpeningBubble(address, locale).message];
}
