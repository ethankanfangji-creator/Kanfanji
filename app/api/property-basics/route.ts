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
import {
  emptyPropertyBasics,
} from "@/lib/property-basics/types";
import { assemblePropertyFacts } from "@/lib/property-facts/orchestrator";
import {
  factCardPromptPayload,
  projectFactCardToBasics,
} from "@/lib/property-facts/project";

export const runtime = "nodejs";

/**
 * Property basics — facts come from PropertyFactCard adapters only.
 * LLM may write a short summary from found fields; it cannot invent listing economics.
 */
export async function POST(request: Request) {
  try {
    assertContentLength(request);
    const input = validatePropertyBasicsBody(await request.json());
    const boundary = await authorizeAiRequest(request, input);

    const { address, locale, userQuestion } = input;

    if (!address.trim()) {
      return boundary.applyCookie(
        NextResponse.json({
          basics: {
            ...emptyPropertyBasics(""),
            needsAddressConfirmation: true,
            message: "Please enter and confirm a property address first.",
          },
        }),
      );
    }

    const card = await assemblePropertyFacts({ address });
    let basics = projectFactCardToBasics(card);

    if (
      userQuestion &&
      !/confirm|address|地址|確認/i.test(userQuestion) &&
      /ignore|forget|另一|other address/i.test(userQuestion)
    ) {
      basics = {
        ...basics,
        needsAddressConfirmation: true,
        message: "Please confirm the property address first.",
      };
      return boundary.applyCookie(NextResponse.json({ basics, factCard: card }));
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      const languageHint =
        locale.startsWith("th")
          ? "ภาษาไทย"
          : locale.startsWith("en")
            ? "English"
            : locale.includes("Hans") || locale.toLowerCase().includes("cn")
              ? "简体中文"
              : "繁體中文";

      const payload = factCardPromptPayload(card);
      try {
        const openai = new OpenAI({ apiKey });
        const completion = await openai.chat.completions.create(
          {
            model: "gpt-4o-mini",
            temperature: 0.2,
            response_format: { type: "json_object" },
            max_tokens: 280,
            messages: [
              {
                role: "system",
                content: `You write a brief property viewing summary from structured facts only.
Never invent price, area, beds, baths, fees, year, zoning, or tax.
If a field has status not_found or needs_human, say it is unknown.
Reply in ${languageHint}. JSON: {"summary": string|null}`,
              },
              {
                role: "user",
                content: `Address: ${address}\nFacts JSON:\n${JSON.stringify(payload)}`,
              },
            ],
          },
          { timeout: aiTimeoutMs() },
        );
        const raw = completion.choices[0]?.message?.content;
        if (raw) {
          const parsed = JSON.parse(raw) as { summary?: string | null };
          if (typeof parsed.summary === "string" && parsed.summary.trim()) {
            basics = {
              ...basics,
              summary: {
                value: parsed.summary.trim().slice(0, 400),
                confidence: "inferred",
                note: "LLM summary from found facts only",
              },
            };
          }
        }
      } catch {
        // keep basics without summary
      }
    }

    return boundary.applyCookie(NextResponse.json({ basics, factCard: card }));
  } catch (error) {
    return aiErrorResponse(error);
  }
}
