import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "尚未設定 OPENAI_API_KEY，請加到 .env.local" },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as {
      base64?: string;
      tag?: string;
      locale?: string;
    };
    const tag = (body.tag || "現場").trim();
    const locale = (body.locale || "zh-Hant").trim();
    let base64 = (body.base64 || "").trim();

    if (!base64) {
      return NextResponse.json({ error: "缺少照片 base64" }, { status: 400 });
    }

    // Accept raw base64 or data URL
    let mime = "image/jpeg";
    const dataUrlMatch = base64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (dataUrlMatch) {
      mime = dataUrlMatch[1];
      base64 = dataUrlMatch[2];
    }

    const languageHint =
      locale.startsWith("th")
        ? "ภาษาไทย only, sharp"
        : locale.startsWith("en")
          ? "English only, sharp"
          : locale.includes("Hans") || locale.toLowerCase().includes("cn")
            ? "简体中文，尖锐"
            : "繁體中文，尖銳";

    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 120,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are a BC home inspector. Looking at this "${tag}" photo, what risk do you see? Reply with ONLY one must-ask open-house question. ${languageHint}.`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mime};base64,${base64}`,
                detail: "low",
              },
            },
          ],
        },
      ],
    });

    const question = (completion.choices[0]?.message?.content || "")
      .trim()
      .replace(/^["「『]|["」』]$/g, "")
      .replace(/^\d+[\.\、\)]\s*/, "")
      .split("\n")[0]
      ?.trim();

    if (!question) {
      return NextResponse.json({ error: "Vision 沒有回傳問題" }, { status: 422 });
    }

    return NextResponse.json({ question, tag });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vision 分析失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
