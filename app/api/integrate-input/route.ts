import { NextResponse } from "next/server";
import {
  AiInputError,
  aiErrorResponse,
  assertContentLength,
  authorizeAiRequest,
  validateIntegrateInputBody,
} from "@/lib/ai-boundary/server-entry";
import { createOpenAiService } from "@/lib/services/ai/openai-adapter";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertContentLength(request);
    const input = validateIntegrateInputBody(await request.json());
    const boundary = await authorizeAiRequest(request, input);

    const ai = createOpenAiService();
    if (ai.status() !== "ready") {
      throw new AiInputError("ai_unavailable", 503);
    }

    const result = await ai.integrateInput({
      viewingSessionId: input.viewingSessionId,
      address: input.address,
      locale: input.locale,
      market: input.market,
      boundQuestionId: input.boundQuestionId,
      boundQuestionText: input.boundQuestionText,
      text: input.text,
      transcript: input.transcript,
      questions: input.questions,
      imageBase64: input.imageBase64,
      imageMime: input.imageMime,
    });

    if (!result.ok) {
      const status =
        result.code === "ai_unavailable"
          ? 503
          : result.code === "ai_cancelled"
            ? 499
            : result.retryable
              ? 502
              : 422;
      throw new AiInputError(result.code, status);
    }

    return boundary.applyCookie(NextResponse.json({ integration: result.integration }));
  } catch (error) {
    return aiErrorResponse(error);
  }
}
