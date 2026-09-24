import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  claimsToLegacyStrings,
  extractJsonObject,
  validateAndNormalizeSummary,
  type ProcessRecordingLegacyPayload,
} from "@/lib/ai-summary";
import {
  AiInputError,
  aiErrorResponse,
  aiOutputLanguageInstruction,
  aiTimeoutMs,
  aiWhisperLanguage,
  assertContentLength,
  authorizeAiRequest,
  validateRecordingForm,
} from "@/lib/ai-boundary/server-entry";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertContentLength(request);
    const form = await request.formData();
    const input = validateRecordingForm(form);
    const boundary = await authorizeAiRequest(request, input);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new AiInputError("ai_unavailable", 503);
    const {
      audio,
      questions,
      address,
      market,
      locale,
      mediaId,
      noteId,
      markers,
      openData,
      propertyContext: property,
    } = input;

    const markersContext = markers
      .map((m) => {
        const t = typeof m.t === "number" ? m.t.toFixed(1) : "?";
        const tag = typeof m.tag === "string" ? m.tag : "other";
        const note = typeof m.note === "string" && m.note.trim() ? ` (${m.note.trim()})` : "";
        return `- ${t}s · ${tag}${note}`;
      })
      .join("\n");

    const od = openData ?? {};
    const openDataContext = [
      typeof od.city === "string" ? `城市：${od.city}` : "",
      typeof od.zoningCode === "string"
        ? `Zoning：${od.zoningCode}${
            typeof od.zoningLabel === "string" ? `（${od.zoningLabel}）` : ""
          }`
        : "",
      typeof od.pid === "string" ? `PID：${od.pid}` : "",
      typeof od.planNumber === "string" ? `Plan：${od.planNumber}` : "",
      typeof od.lotNumber === "string" ? `Lot：${od.lotNumber}` : "",
      typeof od.legalDescription === "string" ? `Legal：${od.legalDescription}` : "",
      typeof od.source === "string" ? `資料來源：${od.source}` : "",
    ]
      .filter(Boolean)
      .join("；");

    const propertyContext = [
      typeof property?.city === "string" ? `城市：${property.city}` : "",
      typeof property?.neighborhood === "string" ? `社區：${property.neighborhood}` : "",
      Array.isArray(property?.tags) ? `標籤：${property.tags.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("；");

    const openai = new OpenAI({ apiKey });

    const whisperLang = aiWhisperLanguage(locale);
    const languageLock = aiOutputLanguageInstruction(locale);

    const transcription = await openai.audio.transcriptions.create(
      {
        file: audio,
        model: "whisper-1",
        language: whisperLang,
      },
      { signal: AbortSignal.timeout(aiTimeoutMs()) },
    );

    const transcript = transcription.text?.trim() || "";
    if (!transcript) {
      throw new AiInputError("ai_empty_transcript", 422);
    }

    const questionList = questions.map((q) => `- id:${q.id} ${q.text}`).join("\n");

    const completion = await openai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
        {
          role: "system",
          content: `You are a Metro Vancouver open-house note structurer.
Never invent facts. Guesses must use confidence "needs_verification", never as facts.
Municipal Open Data is background only — do not inject zoning/PID questions without dialogue triggers.
${languageLock}
Reply JSON string values in the locked output language only.`,
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
      },
      { signal: AbortSignal.timeout(aiTimeoutMs()) },
    );

    const content = completion.choices[0]?.message?.content ?? "";
    let raw: unknown;
    try {
      raw = extractJsonObject(content);
    } catch {
      throw new AiInputError("ai_response_invalid", 422);
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
      throw new AiInputError("ai_schema_invalid", 422);
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

    return boundary.applyCookie(NextResponse.json({
      transcript: summary.transcript || transcript,
      answers: legacyAnswers,
      new_questions: newQuestions,
      /** Legacy string arrays for existing card/sync paths. */
      pros: claimsToLegacyStrings(summary.pros, 5),
      risks: claimsToLegacyStrings(summary.risks, 5),
      summary,
      warnings: validated.warnings,
      jobId: mediaId,
    }));
  } catch (error) {
    return aiErrorResponse(error);
  }
}
