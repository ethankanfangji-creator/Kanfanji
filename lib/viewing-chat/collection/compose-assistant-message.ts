import type {
  ConversationStatus,
  RecordChange,
  SuggestedQuestion,
  TurnIntent,
} from "./orchestrator-types";
import { detectPrimaryLanguage } from "./classify-turn-intent";
import type { ExtractedPropertyFact, PropertyFieldId } from "./types";

function formatValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && value >= 10_000 && value % 10_000 === 0) {
    return `${value / 10_000}萬`;
  }
  return String(value);
}

function fieldLabel(fieldId: PropertyFieldId, lang: "zh" | "en" | "th" | "other"): string {
  const zh: Record<string, string> = {
    address: "地址",
    price: "價格",
    area: "坪數",
    layout: "格局",
    floor: "樓層",
    noise: "噪音",
    transit: "交通",
    pros: "優點",
    cons: "缺點",
    odor: "氣味",
    light: "採光",
    water_damage: "水損",
    electrical: "電力",
    plumbing: "水路",
    hvac: "空調",
    parking: "車位",
    amenities: "設備",
  };
  const en: Record<string, string> = {
    address: "address",
    price: "price",
    area: "area",
    layout: "layout",
    floor: "floor",
    noise: "noise",
    transit: "transit",
    pros: "pros",
    cons: "cons",
  };
  if (lang === "en") return en[fieldId] ?? fieldId;
  return zh[fieldId] ?? fieldId;
}

function pick<T>(items: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * (i + 1)) % 997;
  return items[h % items.length]!;
}

function skipHint(lang: "zh" | "en" | "th" | "other"): string {
  if (lang === "en") {
    return pick(
      [
        "You can skip any of these, or keep adding notes in any order.",
        "No need to answer in order — skip or add more whenever you like.",
        "Feel free to skip, correct earlier details, or paste another observation.",
      ],
      lang + "skip",
    );
  }
  return pick(
    [
      "這些都可以跳過，或隨時用自己的話繼續補充。",
      "不用照順序答；想跳過、更正或再補一段都可以。",
      "有漏的之後再補也沒關係，直接說「跳過」也行。",
    ],
    lang + "skip",
  );
}

function understandLine(
  intent: TurnIntent,
  sourceText: string,
  lang: "zh" | "en" | "th" | "other",
): string {
  const seed = `${intent}:${sourceText.slice(0, 24)}`;
  if (lang === "en") {
    if (intent === "finish") {
      return pick(
        [
          "Got it — I'll pause new questions and review what we have.",
          "Understood. Let's wrap the capture and look at the summary.",
        ],
        seed,
      );
    }
    if (intent === "correct") {
      return pick(
        ["Thanks for the correction — I've updated the record.", "Noted, correcting that now."],
        seed,
      );
    }
    if (intent === "skip") {
      return pick(
        ["Okay, we'll leave that for later.", "Skipped — we can fill it another time."],
        seed,
      );
    }
    if (intent === "upload_related") {
      return pick(
        [
          "I've saved your media with this turn.",
          "Photo/file noted — I'll only treat vision hints as unverified.",
        ],
        seed,
      );
    }
    if (intent === "question") {
      return pick(
        [
          "Good question — I'll keep collecting facts from what you share.",
          "I hear the question; for now I'll stick to recording what you've observed.",
        ],
        seed,
      );
    }
    return pick(
      [
        "I've taken in what you just shared.",
        "Thanks — logged your on-site notes.",
        "Understood from your message.",
      ],
      seed,
    );
  }

  // zh / default
  if (intent === "finish") {
    return pick(
      [
        "好，先停住追問，幫你整理目前已有的紀錄。",
        "了解，這輪先進入整理，不再塞新的檢查題。",
      ],
      seed,
    );
  }
  if (intent === "correct") {
    return pick(
      ["收到更正，我已依你的說法更新。", "好，以你這次說的為準，已改掉舊值。"],
      seed,
    );
  }
  if (intent === "skip") {
    return pick(
      ["好，這項先跳過。", "沒問題，先標成之後再補。"],
      seed,
    );
  }
  if (intent === "upload_related") {
    return pick(
      [
        "已把這則素材收進紀錄；影像推測先當未確認觀察。",
        "照片／檔案已保存，不會把推測寫成確定事實。",
      ],
      seed,
    );
  }
  if (intent === "question") {
    return pick(
      [
        "問題收到；我先持續幫你記現場觀察，不強迫你照題目答。",
        "可以邊問邊記——你想到什麼就說什麼。",
      ],
      seed,
    );
  }
  return pick(
    [
      "我聽懂你這段描述了。",
      "這段現場觀察已收下。",
      "好的，內容我對上了。",
    ],
    seed,
  );
}

function changesBlock(
  changes: RecordChange[],
  lang: "zh" | "en" | "th" | "other",
): string | null {
  const meaningful = changes.filter(
    (c) =>
      c.kind === "added" ||
      c.kind === "updated" ||
      c.kind === "corrected" ||
      c.kind === "conflict" ||
      c.kind === "skipped" ||
      c.kind === "unknown",
  );
  if (!meaningful.length) return null;

  const lines = meaningful.slice(0, 8).map((c) => {
    const label = fieldLabel(c.fieldId, lang);
    if (c.kind === "corrected") {
      return lang === "en"
        ? `• ${label}: ${formatValue(c.previousValue)} → ${formatValue(c.nextValue)}`
        : `• ${label}：${formatValue(c.previousValue)} → ${formatValue(c.nextValue)}`;
    }
    if (c.kind === "conflict") {
      return lang === "en"
        ? `• ${label}: kept prior value (conflict with “${formatValue(c.nextValue)}”)`
        : `• ${label}：保留原值（與「${formatValue(c.nextValue)}」衝突，未靜默覆蓋）`;
    }
    if (c.kind === "skipped" || c.kind === "unknown") {
      return lang === "en" ? `• ${label}: deferred` : `• ${label}：先跳過／未知`;
    }
    const val = formatValue(c.nextValue) || c.rawText || "";
    return lang === "en" ? `• ${label}: ${val}` : `• ${label}：${val}`;
  });

  const header =
    lang === "en"
      ? pick(["Updates this turn:", "Here's what changed:"], String(meaningful.length))
      : pick(["這輪新增／調整：", "剛記入的內容："], String(meaningful.length));

  return `${header}\n${lines.join("\n")}`;
}

function questionsBlock(
  questions: SuggestedQuestion[],
  lang: "zh" | "en" | "th" | "other",
): string | null {
  if (!questions.length) return null;
  const header =
    lang === "en"
      ? pick(
          ["If useful, we could also check:", "Optional follow-ups (skip anytime):"],
          questions[0]!.fieldId,
        )
      : pick(
          ["若方便，還想跟你確認這幾點（可跳過）：", "接下來這幾個是選答："],
          questions[0]!.fieldId,
        );
  const lines = questions.map((q, i) => `${i + 1}. ${q.question}`);
  return `${header}\n${lines.join("\n")}`;
}

export function composeAssistantMessage(input: {
  intent: TurnIntent;
  sourceText: string;
  changes: RecordChange[];
  questions: SuggestedQuestion[];
  status: ConversationStatus;
  warnings: string[];
  extracted?: ExtractedPropertyFact[];
}): string {
  const lang = detectPrimaryLanguage(input.sourceText);
  const parts: string[] = [];

  parts.push(understandLine(input.intent, input.sourceText, lang));

  for (const w of input.warnings) {
    if (w === "empty_message") {
      parts.push(
        lang === "en"
          ? "I didn't catch any text yet — a short note or photo caption works."
          : "這則還沒看到文字內容；用一句話或幫照片加註也可以。",
      );
    } else if (w === "pending_vision") {
      parts.push(
        lang === "en"
          ? "Your image is saved; vision extraction isn't ready, so I won't invent details from it."
          : "圖片已留下；影像辨識還沒完成，我不會憑空寫屋況細節。",
      );
    } else if (w === "incomplete_transcript") {
      parts.push(
        lang === "en"
          ? "The transcript looks incomplete — feel free to restate or type the missing part."
          : "語音轉錄看起來不完整，你可以再補一句或打字修正。",
      );
    } else if (w === "llm_failed") {
      // Stay quiet in user-facing copy; facts were still saved.
    }
  }

  const changeText = changesBlock(input.changes, lang);
  if (changeText) parts.push(changeText);

  if (input.status === "reviewing" || input.intent === "finish") {
    parts.push(
      lang === "en"
        ? "When you're ready, generate the family summary card — or keep adding notes."
        : "若要給家人看的摘要卡，可以點「產生報告」；想繼續補也可以直接說。",
    );
  } else {
    const qBlock = questionsBlock(input.questions, lang);
    if (qBlock) {
      parts.push(qBlock);
      parts.push(skipHint(lang));
    } else if (input.intent !== "skip") {
      parts.push(
        lang === "en"
          ? "No urgent gaps right now — add anything else you notice, or finish when ready."
          : "目前沒有特別急的缺口；想到什麼再補，或說「整理一下」也可以。",
      );
    }
  }

  return parts.filter(Boolean).join("\n\n");
}
