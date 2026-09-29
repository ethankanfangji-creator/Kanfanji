import { describe, expect, it } from "vitest";
import { RequestValidationError } from "@/lib/http/validation";
import { parseChatMessages, parseChatState, parseClientUpdatedAt } from "./thread-payload";

describe("thread payload", () => {
  it("rejects garbage messages", () => {
    expect(() => parseChatMessages("garbage")).toThrow(RequestValidationError);
  });

  it("rejects a message without a timestamp", () => {
    expect(() =>
      parseChatMessages([{ id: "m1", role: "user", type: "text", text: "hi" }]),
    ).toThrow(RequestValidationError);
  });

  it("rejects a numeric chat state", () => {
    expect(() => parseChatState(123)).toThrow(RequestValidationError);
  });

  it("rejects a client timestamp years ahead", () => {
    expect(() => parseClientUpdatedAt("2099-01-01T00:00:00.000Z", Date.parse("2026-09-28T00:00:00.000Z"))).toThrow(
      RequestValidationError,
    );
  });
});
