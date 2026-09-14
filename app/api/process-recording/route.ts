import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type QuestionInput = {
  id: number;
  text: string;
};

type AnalysisResult = {
  answers: Array<{
    id: number;
    status: "answered" | "pending";
    answer: string;
  }>;
  new_questions: Array<{
    text: string;
    status: "answered" | "pending";
    answer: string;
    reason?: string;
    based_on?: string;
  }>;
  pros: string[];
  risks: string[];
};

function extractJson(text: string): AnalysisResult {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("模型沒有回傳 JSON");
  }
  return JSON.parse(raw.slice(start, end + 1)) as AnalysisResult;
}

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

    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "缺少錄音檔" }, { status: 400 });
    }
    if (typeof questionsRaw !== "string") {
      return NextResponse.json({ error: "缺少題庫" }, { status: 400 });
    }

    const questions = JSON.parse(questionsRaw) as QuestionInput[];
    let openDataContext = "";
    try {
      if (typeof openDataRaw === "string" && openDataRaw && openDataRaw !== "null") {
        const od = JSON.parse(openDataRaw) as Record<string, unknown>;
        const bits = [
          od.city ? `城市：${od.city}` : "",
          od.zoningCode ? `Zoning：${od.zoningCode}${od.zoningLabel ? `（${od.zoningLabel}）` : ""}` : "",
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

    const audioFile = audio;
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
      file: audioFile,
      model: "whisper-1",
      language: whisperLang,
    });

    const transcript = transcription.text?.trim() || "";
    if (!transcript) {
      return NextResponse.json({ error: "Whisper 沒有辨識到內容" }, { status: 422 });
    }

    const questionList = questions
      .map((q) => `- id:${q.id} ${q.text}`)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a Metro Vancouver open-house advisor. Only fill answers from the recording; never invent facts. Municipal Open Data is background only — do not inject zoning/PID questions without dialogue triggers. Reply JSON string values in ${replyLanguage}.`,
        },
        {
          role: "user",
          content: `From this open-house dialogue and question bank:
1) Fill answers for existing questions; unanswered → pending
2) Create follow-ups from dialogue; if Open Data exists, weave zoning/PID/title/permit angles ONLY when dialogue touches related topics
3) Summarize 3 pros and 3 risks
Return JSON. All human-readable strings must be in ${replyLanguage}.

Address: ${address || "unknown"}
Market: ${market}
UI locale: ${locale}
Property context: ${propertyContext || "none"}
Municipal Open Data (background only): ${openDataContext || "none"}

Question bank:
${questionList || "(empty)"}

Dialogue transcript:
${transcript}

Strict JSON shape:
{
  "answers": [
    { "id": 1, "status": "answered" | "pending", "answer": "..." }
  ],
  "new_questions": [
    {
      "text": "follow-up to ask agent/owner",
      "status": "answered" | "pending",
      "answer": "...",
      "reason": "why ask now",
      "based_on": "dialogue trigger; mention zoning/PID if used"
    }
  ],
  "pros": ["...", "...", "..."],
  "risks": ["...", "...", "..."]
}

Rules:
1. new_questions must be dialogue-triggered, not a generic municipal checklist
2. With Open Data: renovation/ADU/use → zoning fit; title/access → PID/easement/covenant; condo fees/levies → strata angle
3. If dialogue never touches those themes, do not force Open Data questions
4. Produce 2-5 follow-ups; no duplicates of existing bank
5. Most follow-ups pending unless fully answered
6. answers must cover every bank id; empty bank → answers=[]
7. pros / risks exactly 3 short family-facing lines each`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "";
    const analysis = extractJson(content);

    if (!Array.isArray(analysis.answers) || !Array.isArray(analysis.pros) || !Array.isArray(analysis.risks)) {
      throw new Error("JSON 格式不完整");
    }

    const newQuestions = Array.isArray(analysis.new_questions)
      ? analysis.new_questions
          .filter((q) => typeof q?.text === "string" && q.text.trim().length > 0)
          .slice(0, 5)
          .map((q) => ({
            text: q.text.trim(),
            status: q.status === "answered" ? "answered" : "pending",
            answer:
              q.status === "answered" && q.answer?.trim()
                ? q.answer.trim()
                : "待確認",
            reason: q.reason?.trim() || "",
            based_on: q.based_on?.trim() || "",
          }))
      : [];

    return NextResponse.json({
      transcript,
      answers: analysis.answers,
      new_questions: newQuestions,
      pros: analysis.pros.slice(0, 3),
      risks: analysis.risks.slice(0, 3),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "處理錄音失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
