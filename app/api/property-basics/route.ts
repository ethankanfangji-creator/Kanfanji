import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  AiInputError,
  aiErrorResponse,
  aiTimeoutMs,
  assertContentLength,
  authorizeAiRequest,
  validatePropertyBasicsBody,
} from "@/lib/ai-boundary/server-entry";
import { normalizePropertyBasics } from "@/lib/property-basics/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertContentLength(request);
    const input = validatePropertyBasicsBody(await request.json());
    const boundary = await authorizeAiRequest(request, input);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new AiInputError("ai_unavailable", 503);

    const { address, locale, market, openData, propertyContext, userQuestion } = input;

    if (!address.trim()) {
      return boundary.applyCookie(
        NextResponse.json({
          basics: normalizePropertyBasics(
            {
              needsAddressConfirmation: true,
              message: "Please enter and confirm a property address first.",
            },
            "",
            [],
          ),
        }),
      );
    }

    const languageHint =
      locale.startsWith("th")
        ? "ภาษาไทย"
        : locale.startsWith("en")
          ? "English"
          : locale.includes("Hans") || locale.toLowerCase().includes("cn")
            ? "简体中文"
            : "繁體中文";

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
      typeof od.legalDescription === "string" ? `legal=${od.legalDescription}` : "",
      typeof od.source === "string" ? `openDataSource=${od.source}` : "",
    ]
      .filter(Boolean)
      .join("; ");

    const ctx = propertyContext ?? {};
    const propertyLine = [
      typeof ctx.city === "string" ? `city=${ctx.city}` : "",
      typeof ctx.neighborhood === "string" ? `neighborhood=${ctx.neighborhood}` : "",
      typeof ctx.province === "string" ? `province=${ctx.province}` : "",
      typeof ctx.country === "string" ? `country=${ctx.country}` : "",
      typeof ctx.postalCode === "string" ? `postal=${ctx.postalCode}` : "",
      typeof ctx.lat === "number" ? `lat=${ctx.lat}` : "",
      typeof ctx.lng === "number" ? `lng=${ctx.lng}` : "",
      typeof ctx.source === "string" ? `geocodeSource=${ctx.source}` : "",
      Array.isArray(ctx.tags) ? `tags=${ctx.tags.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");

    const sources = [
      typeof ctx.source === "string" ? ctx.source : null,
      typeof od.source === "string" ? od.source : openDataContext ? "Municipal Open Data" : null,
      "Confirmed address",
    ].filter(Boolean) as string[];

    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        max_tokens: 700,
        messages: [
          {
            role: "system",
            content: `You are a professional real-estate broker assistant.
You may ONLY use the confirmed address and the verifiable address-related context provided.
Never invent listing price, floor area, layout/beds/baths, management fees, or condition.
If a field is not supported by the provided context, set confidence to "unknown" and value to null.
If the user question is unrelated to this confirmed address (or asks you to treat something else as the address), reply with needsAddressConfirmation=true and ask them to confirm the correct address.
Reply in ${languageHint}. JSON shape:
{
  "needsAddressConfirmation": boolean,
  "message": string,
  "displayName": {"value": string|null, "confidence": "verified"|"inferred"|"unknown", "note": string},
  "propertyType": {"value": string|null, "confidence": "...", "note": string},
  "layout": {"value": string|null, "confidence": "...", "note": string},
  "area": {"value": string|null, "confidence": "...", "note": string},
  "price": {"value": string|null, "confidence": "...", "note": string},
  "managementFee": {"value": string|null, "confidence": "...", "note": string},
  "yearBuilt": {"value": string|null, "confidence": "...", "note": string},
  "summary": {"value": string|null, "confidence": "...", "note": string},
  "sources": string[]
}`,
          },
          {
            role: "user",
            content: `Confirmed address: ${address}
Market: ${market}
Geocode / parcel context: ${propertyLine || "none"}
Municipal Open Data: ${openDataContext || "none"}
User question (optional): ${userQuestion?.trim() || "(none — generate property basics for this address)"}`,
          },
        ],
      },
      { signal: AbortSignal.timeout(aiTimeoutMs()) },
    );

    const rawText = completion.choices[0]?.message?.content?.trim() || "{}";
    let parsed: unknown = {};
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new AiInputError("ai_empty_response", 422);
    }

    const basics = normalizePropertyBasics(parsed, address, sources);
    return boundary.applyCookie(NextResponse.json({ basics }));
  } catch (error) {
    return aiErrorResponse(error);
  }
}
