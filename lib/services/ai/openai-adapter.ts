/**
 * Server-only OpenAI AiService. Never import from client components.
 */

import OpenAI from "openai";
import { aiTimeoutMs } from "@/lib/ai-boundary/config";
import { AiInputError } from "@/lib/ai-boundary/validation";
import { normalizeIntegrationPayload } from "@/lib/viewing-wizard/input-integration";
import {
  createMockAiService,
  resolveAiServiceStatus,
  type AiIntegrateInput,
  type AiIntegrateResult,
  type AiService,
} from "./types";

function languageHint(locale: string): string {
  if (locale.startsWith("th")) return "Thai";
  if (locale.startsWith("en")) return "English";
  if (locale.includes("Hans")) return "Simplified Chinese";
  return "Traditional Chinese";
}

export function createOpenAiService(apiKey = process.env.OPENAI_API_KEY): AiService {
  const status = resolveAiServiceStatus(apiKey);
  if (status !== "ready" || !apiKey?.trim()) {
    return createMockAiService({ status: "unconfigured" });
  }

  const openai = new OpenAI({ apiKey });

  return {
    status: () => "ready",
    async integrateInput(
      input: AiIntegrateInput & { imageMime?: string | null },
      signal?: AbortSignal,
    ): Promise<AiIntegrateResult> {
      try {
        const questionList = input.questions
          .map(
            (q) =>
              `- id:${q.id} [${q.category ?? "other"}] ${q.text}${
                q.answer ? ` | existingAnswer=${q.answer}` : ""
              }`,
          )
          .join("\n");

        const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
          {
            type: "text",
            text: `Integrate this on-site input into the CURRENT viewing only.

Confirmed viewing address: ${input.address}
Viewing session id: ${input.viewingSessionId}
Bound ticket id: ${input.boundQuestionId ?? "none"}
Bound ticket text: ${input.boundQuestionText ?? "none"}
User text: ${input.text || "(none)"}
Transcript: ${input.transcript || "(none)"}

Existing tickets:
${questionList || "(empty)"}

Rules:
- Treat input only as auxiliary evidence for THIS viewing. Never invent a new address or another property.
- If the user asks about a different address / off-topic global knowledge, refuse and ask them to stay on this viewing.
- Merge into bound ticket when present; do not erase existingAnswer — propose an additive answerPatch.
- Discover at most 5 new tickets if truly warranted; mark them as AI discoveries.
- If an image is provided but content is unclear, set imageUncertain=true and do not speculate on condition.
- Source labels: user_input vs ai_inferred.
- Reply JSON in ${languageHint(input.locale)}:
{
  "imageUncertain": boolean,
  "message": string,
  "fallbackAnswer": string,
  "boundQuestionUpdates": [{"questionId": number, "answerPatch": string, "status": "answered"|"needs_more", "evidence": string, "source": "user_input"|"ai_inferred"}],
  "discoveryTickets": [{"title": string, "category": "condition"|"transit"|"amenities"|"costs_docs"|"onsite_confirm", "priority": "high"|"medium"|"low", "description": string}],
  "summaryPatches": {"risks": string[], "followUps": string[], "actionItems": string[]}
}`,
          },
        ];

        if (input.imageBase64) {
          userContent.push({
            type: "image_url",
            image_url: { url: input.imageBase64, detail: "low" },
          });
        }

        const completion = await openai.chat.completions.create(
          {
            model: "gpt-4o-mini",
            temperature: 0.2,
            response_format: { type: "json_object" },
            max_tokens: 900,
            messages: [
              {
                role: "system",
                content:
                  "You are an open-house viewing integrator. Never overwrite prior notes; only propose additive patches. Never invent listing economics. Unclear photos → imageUncertain.",
              },
              { role: "user", content: userContent },
            ],
          },
          { signal: signal ?? AbortSignal.timeout(aiTimeoutMs()) },
        );

        const rawText = completion.choices[0]?.message?.content?.trim() || "{}";
        let parsed: unknown = {};
        try {
          parsed = JSON.parse(rawText);
        } catch {
          return {
            ok: false,
            code: "ai_empty_response",
            message: "AI returned an empty or invalid response.",
            retryable: true,
          };
        }

        return {
          ok: true,
          integration: normalizeIntegrationPayload(parsed, input.boundQuestionId),
        };
      } catch (error) {
        if (error instanceof AiInputError) {
          return {
            ok: false,
            code: error.code,
            message: error.message,
            retryable: error.status >= 500 || error.status === 429,
          };
        }
        const aborted =
          (error instanceof Error && error.name === "AbortError") ||
          (typeof error === "object" &&
            error !== null &&
            "name" in error &&
            (error as { name: string }).name === "AbortError");
        if (aborted) {
          return {
            ok: false,
            code: "ai_cancelled",
            message: "AI request cancelled.",
            retryable: true,
          };
        }
        return {
          ok: false,
          code: "ai_upstream_error",
          message: "AI upstream request failed.",
          retryable: true,
        };
      }
    },
  };
}
