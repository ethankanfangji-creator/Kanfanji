import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  claimsToLegacyStrings,
  extractJsonObject,
  validateAndNormalizeSummary,
  type ProcessRecordingLegacyPayload,
} from "@/lib/ai-summary";

export const runtime = "nodejs";

type QuestionInput = {
  id: number;
  text: string;
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "尚未設定 OPENAI_API_KEY，請加到 .env.local" },
      { status: 500 },
    );
  }

  try {
    const form = await request.formData();
    const audio = form.get("audio");
    const questionsRaw = form.get("questions");
    const address = String(form.get("address") ?? "");
    const market = String(form.get("market") ?? "CA");
    const locale = String(form.get("locale") ?? "zh-Hant");
    const openDataRaw = form.get("openData");
    const propertyContextRaw = form.get("propertyContext");
    const markersRaw = form.get("markers");
    const mediaId = String(form.get("mediaId") ?? "") || null;
    const noteIdRaw = form.get("noteId");
    const noteId =
      typeof noteIdRaw === "string" && noteIdRaw.trim()
        ? Number(noteIdRaw)
        : null;

    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "缺少錄音檔" }, { status: 400 });
    }
    if (typeof questionsRaw !== "string") {
      return NextResponse.json({ error: "缺少題庫" }, { status: 400 });
    }

    let questions: QuestionInput[] = [];
    try {
      questions = JSON.parse(questionsRaw) as QuestionInput[];
      if (!Array.isArray(questions)) throw new Error("questions not array");
    } catch {
      return NextResponse.json(
        { error: "題庫 JSON 格式錯誤，請重新整理後再試" },
        { status: 400 },
      );
    }

    let markersContext = "";
    try {
      if (typeof markersRaw === "string" && markersRaw.trim()) {
        const markers = JSON.parse(markersRaw) as Array<{
          t?: number;
          tag?: string;
          note?: string;
        }>;
        if (Array.isArray(markers) && markers.length > 0) {
          markersContext = markers
            .slice(0, 40)
            .map((m) => {
              const t = typeof m.t === "number" ? m.t.toFixed(1) : "?";
              const tag = typeof m.tag === "string" ? m.tag : "other";
              const note =
                typeof m.note === "string" && m.note.trim()
                  ? ` (${m.note.trim()})`
                  : "";
              return `- ${t}s · ${tag}${note}`;
            })
            .join("\n");
        }
      }
    } catch {
      markersContext = "";
    }

    let openDataContext = "";
    try {
      if (typeof openDataRaw === "string" && openDataRaw && openDataRaw !== "null") {
        const od = JSON.parse(openDataRaw) as Record<string, unknown>;
        const bits = [
          od.city ? `城市：${od.city}` : "",
          od.zoningCode
            ? `Zoning：${od.zoningCode}${od.zoningLabel ? `（${od.zoningLabel}）` : ""}`
            : "",
          od.pid ? `PID：${od.pid}` : "",
          od.planNumber ? `Plan：${od.planNumber}` : "",
          od.lotNumber ? `Lot：${od.lotNumber}` : "",
          od.legalDescription ? `Legal：${od.legalDescription}` : "",
          od.source ? `資料來源：${od.source}` : "",
        ].filter(Boolean);
        openDataContext = bits.join("；");
      }
    } catch {
      openDataContext = "";
    }

    let propertyContext = "";
    try {
      if (typeof propertyContextRaw === "string" && propertyContextRaw) {
        const pc = JSON.parse(propertyContextRaw) as {
          tags?: string[];
          neighborhood?: string;
          city?: string;
        };
        propertyContext = [
          pc.city ? `城市：${pc.city}` : "",
          pc.neighborhood ? `社區：${pc.neighborhood}` : "",
          pc.tags?.length ? `標籤：${pc.tags.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("；");
      }
    } catch {
      propertyContext = "";
    }

    const openai = new OpenAI({ apiKey });

    const whisperLang = locale.startsWith("th")
      ? "th"
      : locale.startsWith("en")
        ? "en"
        : "zh";
    const replyLanguage = locale.startsWith("th")
      ? "Thai (ภาษาไทย)"
      : locale.startsWith("en")
        ? "English"
        : locale.includes("Hans") || locale.toLowerCase().includes("cn")
          ? "Simplified Chinese (简体中文)"
          : "Traditional Chinese (繁體中文)";

    const transcription = await openai.audio.transcriptions.create({
      file: audio,
      model: "whisper-1",
      language: whisperLang,
    });

    const transcript = transcription.text?.trim() || "";
    if (!transcript) {
      return NextResponse.json(
        { error: "Whisper 沒有辨識到內容，請再錄一段或改匯入音檔" },
        { status: 422 },
      );
    }

    const questionList = questions.map((q) => `- id:${q.id} ${q.text}`).join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a Metro Vancouver open-house note structurer.
Never invent facts. Guesses must use confidence "needs_verification", never as facts.
Municipal Open Data is background only — do not inject zoning/PID questions without dialogue triggers.
Reply JSON string values in ${replyLanguage}.`,
        },
        {
          role: "user",
          content: `Structure this open-house recording into verifiable claims.

Also:
1) Fill answers for existing question bank ids (unanswered → pending)
2) Create followUps from dialogue (and Open Data only when dialogue touches related topics)
3) Separate facts vs pros vs risks vs actionItems
4) Attach sources with transcript timestamps when possible; use marker times as hints

Address: ${address || "unknown"}
Market: ${market}
UI locale: ${locale}
Property context: ${propertyContext || "none"}
Municipal Open Data (background only): ${openDataContext || "none"}
mediaId: ${mediaId || "unknown"}
noteId: ${noteId ?? "unknown"}

Question bank:
${questionList || "(empty)"}

Dialogue transcript:
${transcript}

User live markers (hints only):
${markersContext || "(none)"}

Strict JSON shape:
{
  "answers": [{ "id": 1, "status": "answered" | "pending", "answer": "..." }],
  "facts": [{ "id": "f1", "text": "...", "confidence": "high"|"medium"|"low"|"needs_verification", "sources": [{ "kind": "transcript"|"marker"|"note"|"media", "timestampSec": 12.5, "quote": "..." }] }],
  "pros": [ /* same claim shape */ ],
  "risks": [ /* same claim shape; speculative risks MUST be needs_verification */ ],
  "followUps": [ /* questions to ask agent/owner/inspector */ ],
  "actionItems": [ /* next steps for the buyer */ ],
  "new_questions": [ /* optional legacy; prefer followUps */ ]
}

Rules:
1. facts = only statements clearly said by people on the recording
2. Do not write guesses as facts — use needs_verification
3. risks are preliminary AI judgments, not a professional inspection
4. followUps 2-5 items; dialogue-triggered; no generic checklist dump
5. answers must cover every bank id; empty bank → answers=[]
6. Prefer 2-5 items per list; empty arrays allowed
7. sources should cite timestampSec / quote when possible`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "";
    let raw: unknown;
    try {
      raw = extractJsonObject(content);
    } catch {
      return NextResponse.json(
        {
          error: "AI 回傳格式錯誤（不是有效 JSON），請稍後再試",
          code: "ai_json_parse_error",
        },
        { status: 422 },
      );
    }

    const payload = {
      ...(raw as ProcessRecordingLegacyPayload),
      transcript,
    };

    const validated = validateAndNormalizeSummary(payload, {
      mediaId,
      noteId: Number.isFinite(noteId) ? noteId : null,
    });

    if (!validated.ok) {
      return NextResponse.json(
        {
          error: validated.error,
          code: "ai_schema_invalid",
          issues: validated.issues,
        },
        { status: 422 },
      );
    }

    const summary = validated.value;
    const legacyAnswers = Array.isArray((payload as ProcessRecordingLegacyPayload).answers)
      ? (payload as ProcessRecordingLegacyPayload).answers!
      : [];

    const newQuestions = Array.isArray((payload as ProcessRecordingLegacyPayload).new_questions)
      ? (payload as ProcessRecordingLegacyPayload).new_questions!
          .filter((q) => typeof q?.text === "string" && q.text.trim().length > 0)
          .slice(0, 5)
          .map((q) => ({
            text: q.text.trim(),
            status: q.status === "answered" ? ("answered" as const) : ("pending" as const),
            answer:
              q.status === "answered" && q.answer?.trim()
                ? q.answer.trim()
                : "待確認",
            reason: q.reason?.trim() || "",
            based_on: q.based_on?.trim() || "",
          }))
      : summary.followUps.slice(0, 5).map((item) => ({
          text: item.text,
          status: "pending" as const,
          answer: "待確認",
          reason: "",
          based_on: item.sources[0]?.quote || "",
        }));

    return NextResponse.json({
      transcript: summary.transcript || transcript,
      answers: legacyAnswers,
      new_questions: newQuestions,
      /** Legacy string arrays for existing card/sync paths. */
      pros: claimsToLegacyStrings(summary.pros, 5),
      risks: claimsToLegacyStrings(summary.risks, 5),
      summary,
      warnings: validated.warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "處理錄音失敗";
    return NextResponse.json({ error: message, code: "ai_processing_failed" }, { status: 500 });
  }
}
