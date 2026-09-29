import { describe, expect, it } from "vitest";
import { assertChatShareExpiry } from "./chat-share-expiry";

const now = new Date("2026-09-28T00:00:00.000Z");

describe("assertChatShareExpiry", () => {
  it("rejects clearing expiry on a chat report", () => {
    expect(() => assertChatShareExpiry({ chat_state: { v: 1 } }, { expiresAt: null }, now)).toThrow(
      "SHARE_EXPIRES_INVALID",
    );
  });

  it("rejects a date later than the share window", () => {
    expect(() =>
      assertChatShareExpiry({ chat_state: { v: 1 } }, { expiresAt: "2027-09-28T00:00:00.000Z" }, now),
    ).toThrow("SHARE_EXPIRES_INVALID");
  });

  it("allows an earlier time", () => {
    expect(() =>
      assertChatShareExpiry({ chat_state: { v: 1 } }, { expiresAt: "2026-10-01T00:00:00.000Z" }, now),
    ).not.toThrow();
  });

  it("leaves v1 shares without chat state alone", () => {
    expect(() => assertChatShareExpiry({ chat_state: null }, { expiresAt: null }, now)).not.toThrow();
  });
});
