import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  AiInputError,
  aiErrorResponse,
  aiTimeoutMs,
  assertContentLength,
  authorizeAiRequest,
  validateViewingHighlightsBody,
} from "@/lib/ai-boundary/server-entry";
import { parseAiHighlightLines } from "@/lib/viewing-wizard/address-highlights";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertContentLength(request);
    const input = validateViewingHighlightsBody(await request.json());
    const boundary = await authorizeAiRequest(request, input);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new AiInputError("ai_unavailable", 503);

    const { address, locale, market, openData, propertyContext } = input;
    const languageHint =
      locale.startsWith("th")
        ? "ภาษาไทย only, sharp open-house questions"
        : locale.startsWith("en")
          ? "English only, sharp open-house questions"
          : locale.includes("Hans") || locale.toLowerCase().includes("cn")
            ? "简体中文，尖锐看房必问"
            : "繁體中文，尖銳看房必問";

    const od = openData ?? {};
    const openDataContext = [
      typeof od.city === "string" ? `city=${od.city}` : "",
      typeof od.zoningCode === "string"
        ? `zoning=${od.zoningCode}${
            typeof od.zoningLabel === "string" ? ` (${od.zoningLabel})` : ""
          }`
        : "",
      typeof od.pid === "string" ? `pid=${od.pid}` : "",
      typeof od.planNumber === "string" ? `plan=${od.planNumber}` : "",
      typeof od.lotNumber === "string" ? `lot=${od.lotNumber}` : "",
    ]
      .filter(Boolean)
      .join("; ");

    const propertyLine = [
      typeof propertyContext?.city === "string" ? `city=${propertyContext.city}` : "",
      typeof propertyContext?.neighborhood === "string"
        ? `neighborhood=${propertyContext.neighborhood}`
        : "",
      Array.isArray(propertyContext?.tags) ? `tags=${propertyContext.tags.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");

    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        temperature: 0.35,
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content: `You are an open-house viewing coach. Given an address and optional municipal Open Data, propose 4-6 must-ask on-site questions. Do not invent listing facts (price, beds, year built). Prefer risks, verification, and negotiation leverage. Reply with one question per line, no numbering. ${languageHint}.`,
          },
          {
            role: "user",
            content: `Address: ${address}
Market: ${market}
Property context: ${propertyLine || "none"}
Open Data: ${openDataContext || "none"}`,
          },
        ],
      },
      { signal: AbortSignal.timeout(aiTimeoutMs()) },
    );

    const raw = completion.choices[0]?.message?.content?.trim() || "";
    const highlights = parseAiHighlightLines(raw);
    if (highlights.length === 0) {
      throw new AiInputError("ai_empty_response", 422);
    }

    return boundary.applyCookie(
      NextResponse.json({
        highlights: highlights.map((text) => ({ text, source: "address_ai" as const })),
      }),
    );
  } catch (error) {
    return aiErrorResponse(error);
  }
}
