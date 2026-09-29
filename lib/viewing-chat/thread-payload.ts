import { RequestValidationError } from "@/lib/http/validation";
import type { ChatMessage } from "./types";

const MAX_BODY = 2_000_000;

export function assertChatBodySize(raw: string) {
  if (raw.length > MAX_BODY) throw new RequestValidationError("BODY_TOO_LARGE");
}

export function parseChatMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) throw new RequestValidationError("INVALID_FIELD_TYPE", "messages");
  if (value.length > 500) throw new RequestValidationError("FIELD_TOO_LONG", "messages");
  return value.map((item) => {
    if (!item || typeof item !== "object") {
      throw new RequestValidationError("INVALID_FIELD_TYPE", "messages");
    }
    const message = item as Record<string, unknown>;
    if (typeof message.id !== "string" || (message.role !== "user" && message.role !== "ai")) {
      throw new RequestValidationError("INVALID_FIELD_TYPE", "messages");
    }
    if (typeof message.type !== "string") {
      throw new RequestValidationError("INVALID_FIELD_TYPE", "messages");
    }
    if (typeof message.timestamp !== "string" || Number.isNaN(Date.parse(message.timestamp))) {
      throw new RequestValidationError("INVALID_FIELD_TYPE", "messages");
    }
    return message as ChatMessage;
  });
}

export function parseChatState(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError("INVALID_FIELD_TYPE", "chatState");
  }
  const state = value as Record<string, unknown>;
  if (state.v !== 1) throw new RequestValidationError("INVALID_FIELD_TYPE", "chatState");
  return state;
}

export function parseClientUpdatedAt(value: unknown, now = Date.now()): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new RequestValidationError("INVALID_FIELD_TYPE", "clientUpdatedAt");
  }
  if (Date.parse(value) > now + 5 * 60_000) {
    throw new RequestValidationError("FIELD_TOO_LONG", "clientUpdatedAt");
  }
  return value;
}
