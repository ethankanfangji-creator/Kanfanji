import type { TurnIntent, UserTurnMessage } from "./orchestrator-types";
import type { CaptureInput, PropertyFieldId } from "./types";

function combinedText(message: UserTurnMessage, captures: CaptureInput[]): string {
  const parts = [
    message.transcript?.trim(),
    message.text?.trim(),
    ...captures
      .filter((c) => c.kind === "text" || c.kind === "transcript")
      .map((c) => c.text?.trim()),
  ];
  return parts.filter(Boolean).join("\n").trim();
}

export function classifyTurnIntent(input: {
  message: UserTurnMessage;
  captures: CaptureInput[];
}): { intent: TurnIntent; skippedFieldIds: PropertyFieldId[] } {
  const text = combinedText(input.message, input.captures);
  const hasMedia = input.captures.some(
    (c) => c.kind === "photo" || c.kind === "video" || c.kind === "file",
  );
  const skippedFieldIds: PropertyFieldId[] = [];

  if (
    /整理一下|先這樣|完成|產生報告|出報告|給我摘要|summarize|wrap up|that'?s enough|finish(ed)?\b|先到這/i.test(
      text,
    )
  ) {
    return { intent: "finish", skippedFieldIds };
  }

  if (
    /(?:坪數|幾坪|面積|sq\s*ft).{0,12}(?:不知道|不清楚|跳過|之後再補)|(?:不知道|不清楚|跳過|之後再補).{0,12}(?:坪數|幾坪|面積)|skip(?:ping)?.{0,12}(?:area|ping)/i.test(
      text,
    )
  ) {
    skippedFieldIds.push("area");
  }
  if (
    /(?:價格|開價|總價).{0,8}(?:跳過|之後再補|不知道)|(?:跳過|之後再補).{0,8}(?:價格|開價)/i.test(
      text,
    )
  ) {
    skippedFieldIds.push("price");
  }
  if (
    /(?:樓層|幾樓).{0,8}(?:跳過|之後再補|不知道)|(?:跳過|之後再補).{0,8}(?:樓層|幾樓)/i.test(
      text,
    )
  ) {
    skippedFieldIds.push("floor");
  }

  if (
    skippedFieldIds.length > 0 ||
    /^(跳過|略過|之後再補|先跳過)([。.!！…]*)$/i.test(text) ||
    /\bskip\b/i.test(text)
  ) {
    return { intent: "skip", skippedFieldIds };
  }

  if (
    /不是.{0,12}是|改成|更正|應該是|搞錯|correction|actually (?:it'?s|its)/i.test(
      text,
    )
  ) {
    return { intent: "correct", skippedFieldIds };
  }

  if (hasMedia && (!text || text.length < 4)) {
    return { intent: "upload_related", skippedFieldIds };
  }
  if (
    hasMedia &&
    /這[張個]|照片|圖片|影片|錄音|上傳|see (?:the )?(?:photo|image|video)/i.test(text)
  ) {
    return { intent: "upload_related", skippedFieldIds };
  }

  if (/[？?]\s*$/.test(text) || /^(嗎|麼|如何|怎麼|什麼|why|how|what)\b/i.test(text)) {
    // Question with little declarative content
    if (text.length < 80) {
      return { intent: "question", skippedFieldIds };
    }
  }

  if (
    /另外|對了|補充|還有|順便|忘了說|also|btw|by the way|補充一下/i.test(text) ||
    text.length > 0
  ) {
    // Default productive path: treat as supplement when there is substance
    if (
      /\d+\s*萬|\d+\s*坪|\d+房|優點|缺點|噪音|吵|採光|地址|格局|開價|售價/i.test(
        text,
      ) ||
      text.length >= 8
    ) {
      return { intent: "supplement", skippedFieldIds };
    }
  }

  return { intent: "general", skippedFieldIds };
}

export function detectPrimaryLanguage(text: string): "zh" | "en" | "th" | "other" {
  if (!text.trim()) return "other";
  if (/[\u0E00-\u0E7F]/.test(text)) return "th";
  if (/[\u4e00-\u9fff]/.test(text)) return "zh";
  if (/[a-zA-Z]{3,}/.test(text) && !/[\u4e00-\u9fff]/.test(text)) return "en";
  return "other";
}
