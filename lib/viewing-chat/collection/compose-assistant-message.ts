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
        "Skip any of these — or keep adding notes in any order.",
        "No fixed order. Skip, correct, or paste another observation anytime.",
      ],
      lang + "skip",
    );
  }
  return pick(
    [
      "這些都只是提醒，可跳過；想到什麼直接說即可。",
      "不用照表填；想跳過、更正或換話題都可以。",
    ],
    lang + "skip",
  );
}

function understandLine(
  intent: TurnIntent,
  sourceText: string,
  lang: "zh" | "en" | "th" | "other",
  changes: RecordChange[],
): string {
  const seed = `${intent}:${sourceText.slice(0, 24)}`;
  const filed = changes.some(
    (c) =>
      c.kind === "added" ||
      c.kind === "updated" ||
      c.kind === "corrected",
  );
  const onlyConflict =
    !filed && changes.some((c) => c.kind === "conflict");

  if (lang === "en") {
    if (intent === "finish") {
      return pick(
        [
          "Got it — pausing new prompts so we can review what we have.",
          "Understood. Let's review the summary card — fields can stay empty.",
        ],
        seed,
      );
    }
    if (intent === "correct") {
      return pick(
        ["Thanks for the correction — the summary now uses your new value.", "Noted, old value replaced."],
        seed,
      );
    }
    if (intent === "skip") {
      return pick(
        ["Okay, leaving that open — we won't get stuck on it.", "Skipped — no need to fill everything."],
        seed,
      );
    }
    if (intent === "upload_related") {
      return pick(
        [
          "Media saved with this turn.",
          "Photo/file noted — vision hints stay unverified.",
        ],
        seed,
      );
    }
    if (intent === "question") {
      return pick(
        [
          "Good question — I'll keep recording what you observe.",
          "I hear the question; for now I'll stick to your on-site notes.",
        ],
        seed,
      );
    }
    if (onlyConflict) {
      return pick(
        [
          "Kept the earlier value for that field — say “yes/no” if you meant the confirm, or keep adding other notes.",
          "I didn’t overwrite the prior guess. Confirm with yes/no anytime, or talk about something else.",
        ],
        seed,
      );
    }
    if (!filed) {
      return pick(
        [
          "Got your note — optional checks can wait; say whatever you notice.",
          "Saved the raw note. Skip the confirm anytime and keep talking.",
        ],
        seed,
      );
    }
    return pick(
      [
        "I've taken in what you just shared.",
        "Logged your on-site notes.",
        "Understood from your message.",
      ],
      seed,
    );
  }

  if (intent === "finish") {
    return pick(
      [
        "好，先停住追問，幫你打開可編輯的看房摘要卡。",
        "了解——完成不代表欄位全滿，我們看目前已有的紀錄即可。",
      ],
      seed,
    );
  }
  if (intent === "correct") {
    return pick(
      ["收到更正，摘要已改成你的新值，舊的有效值已拿掉。", "好，以你這次說的為準。"],
      seed,
    );
  }
  if (intent === "skip") {
    return pick(
      ["好，這項先留空，不會卡在這裡。", "沒問題，不知道就先跳過。"],
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
  if (onlyConflict) {
    return pick(
      [
        "這句沒拿去改掉先前的推測；要確認那題回「對／不是」，或直接說別的觀察。",
        "先不覆蓋舊值。確認題可稍後再答，想到什麼直接說即可。",
      ],
      seed,
    );
  }
  if (!filed) {
    return pick(
      [
        "先收下這句現場觀察；確認題可跳過，想到什麼直接說。",
        "這句我記下了。不用先回確認，繼續講你看到的就好。",
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
  options?: { omitFiledValues?: boolean },
): string | null {
  const meaningful = changes.filter((c) => {
    if (
      c.kind === "conflict" ||
      c.kind === "skipped" ||
      c.kind === "unknown" ||
      c.kind === "corrected"
    ) {
      return true;
    }
    // added / updated — UI matched chips already show these
    if (options?.omitFiledValues) return false;
    return c.kind === "added" || c.kind === "updated";
  });
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
      return lang === "en" ? `• ${label}: left open` : `• ${label}：先留空／未知`;
    }
    const val = formatValue(c.nextValue) || c.rawText || "";
    return lang === "en" ? `• ${label}: ${val}` : `• ${label}：${val}`;
  });

  const header =
    lang === "en"
      ? pick(
          ["What changed this turn:", "Here's what we just filed:"],
          String(meaningful.length),
        )
      : pick(
          ["這一輪新收到、已歸檔：", "剛記入的變更："],
          String(meaningful.length),
        );

  return `${header}\n${lines.join("\n")}`;
}

/**
 * Reminders driven by what just changed — never “the next agenda question”.
 * Supports confirm (招1), composite (招2), clarify (招3).
 */
function remindersBlock(
  questions: SuggestedQuestion[],
  changes: RecordChange[],
  lang: "zh" | "en" | "th" | "other",
): string | null {
  if (!questions.length) return null;
  const kinds = new Set(questions.map((q) => q.kind ?? "open"));
  const touched = changes.some(
    (c) =>
      c.kind === "added" ||
      c.kind === "updated" ||
      c.kind === "corrected" ||
      c.kind === "conflict",
  );

  let header: string;
  if (kinds.has("clarify")) {
    header =
      lang === "en"
        ? "Quick check — your last note was a bit vague:"
        : "剛說的有點籠統，想跟你確認一下：";
  } else if (kinds.has("confirm")) {
    header =
      lang === "en"
        ? "Easy confirm (yes / no is enough):"
        : "輕鬆確認一下（回「對」或「不是」就好）：";
  } else if (kinds.has("composite")) {
    header =
      lang === "en"
        ? "One multi-part check (answer any pieces you know):"
        : "一次問幾件（知道的一起說就好）：";
  } else if (touched) {
    header =
      lang === "en"
        ? pick(
            [
              "Given what just changed, worth a quick check (optional):",
              "Most useful to clarify next (skip anytime):",
            ],
            questions[0]!.fieldId,
          )
        : pick(
            [
              "依這一輪剛記入的內容，現在比較值得提醒你（可跳過）：",
              "順著剛收到的資訊，這幾點最值得補一下（選答）：",
            ],
            questions[0]!.fieldId,
          );
  } else {
    header =
      lang === "en"
        ? pick(
            ["If useful, optional reminders:", "Worth noting when you can (skip anytime):"],
            questions[0]!.fieldId,
          )
        : pick(
            [
              "若方便，這幾點值得留意（可跳過）：",
              "目前比較值得提醒你的是（選答）：",
            ],
            questions[0]!.fieldId,
          );
  }

  // Label each reminder with its slot so multi-ask replies are easier to map
  const lines = questions.map((q, i) => {
    const tag =
      lang === "en"
        ? fieldLabel(q.fieldId, lang)
        : fieldLabel(q.fieldId, lang);
    return `${i + 1}. 【${tag}】${q.question}`;
  });
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

  parts.push(understandLine(input.intent, input.sourceText, lang, input.changes));

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
    } else if (w === "extraction_failed" || w === "llm_failed") {
      parts.push(
        lang === "en"
          ? "AI polish failed, but your raw message and filed facts are kept — you can retry."
          : "AI 潤飾失敗，但你的原始輸入與已歸檔資料都在，可重試。",
      );
    } else if (w === "polish_failed") {
      // Soft — draft reply already usable; don't scare the user
    }
  }

  // Filed facts are shown as matched chips in the UI — don't also list them in prose
  // (that made「已記下」appear twice). Keep conflict/unknown/skipped lines only.
  const changeText = changesBlock(input.changes, lang, {
    omitFiledValues: true,
  });
  if (changeText) parts.push(changeText);

  if (input.status === "reviewing" || input.intent === "finish") {
    parts.push(
      lang === "en"
        ? "Open the summary card to edit, confirm, or share — empty fields are fine."
        : "請打開看房摘要卡：可編輯、確認或分享；欄位留空也沒關係。",
    );
  } else {
    const qBlock = remindersBlock(input.questions, input.changes, lang);
    if (qBlock) {
      parts.push(qBlock);
      parts.push(skipHint(lang));
    } else if (input.intent !== "skip") {
      parts.push(
        lang === "en"
          ? "Nothing urgent to remind you of — add more notes, or finish when ready."
          : "目前沒有特別急著提醒的；想到再補，或說「整理一下／完成」也可以。",
      );
    }
  }

  return parts.filter(Boolean).join("\n\n");
}
