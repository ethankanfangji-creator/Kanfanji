import { describe, expect, it } from "vitest";
import { AiInputError } from "./validation";
import { aiErrorResponse } from "./server";

describe("AI public errors", () => {
  it("returns Retry-After for quota errors", async () => {
    const error = Object.assign(new AiInputError("ai_quota_exceeded", 429), {
      retryAfter: 37,
    });
    const response = aiErrorResponse(error);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("37");
    expect(await response.json()).toEqual({
      error: "AI request could not be completed.",
      code: "ai_quota_exceeded",
    });
  });

  it("redacts upstream details and classifies timeouts", async () => {
    const response = aiErrorResponse(
      new DOMException("secret provider payload and API key", "TimeoutError"),
    );
    expect(response.status).toBe(504);
    const body = await response.text();
    expect(body).toContain("ai_upstream_timeout");
    expect(body).not.toContain("secret provider payload");
  });

  it("redacts other upstream failures", async () => {
    const response = aiErrorResponse(new Error("OpenAI internal request id abc123"));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "AI request could not be completed.",
      code: "ai_upstream_failed",
    });
  });
});
