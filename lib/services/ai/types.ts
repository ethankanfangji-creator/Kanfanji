/**
 * Swappable AI integration surface.
 * UI must call /api/* (or a browser client wrapping these); never OpenAI SDK in the browser.
 *
 * Real adapter: `createOpenAiService` (server-only). Routes should use that factory.
 */

export type AiServiceStatus = "ready" | "unconfigured" | "error";

export type AiIntegrateInput = {
  viewingSessionId: string;
  address: string;
  locale: string;
  market: string;
  boundQuestionId: number | null;
  boundQuestionText: string | null;
  text: string;
  transcript: string;
  questions: Array<{ id: number; text: string; answer?: string; category?: string }>;
  imageBase64: string | null;
  imageMime?: string | null;
};

export type AiIntegrateResult = {
  ok: true;
  integration: unknown;
} | {
  ok: false;
  code: string;
  message: string;
  retryable: boolean;
};

export type AiService = {
  status(): AiServiceStatus;
  /** Server-only: integrate on-site input into the current viewing. */
  integrateInput(input: AiIntegrateInput, signal?: AbortSignal): Promise<AiIntegrateResult>;
};

export function createMockAiService(options?: {
  status?: AiServiceStatus;
  integrate?: AiService["integrateInput"];
}): AiService {
  const status = options?.status ?? "unconfigured";
  return {
    status: () => status,
    integrateInput:
      options?.integrate ??
      (async () => ({
        ok: false,
        code: "ai_unavailable",
        message: "AI service is not configured (mock).",
        retryable: false,
      })),
  };
}

/** Prefer real OpenAI only on the server when OPENAI_API_KEY is set. */
export function resolveAiServiceStatus(apiKey: string | undefined): AiServiceStatus {
  return apiKey?.trim() ? "ready" : "unconfigured";
}
