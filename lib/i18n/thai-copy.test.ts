import { describe, expect, it } from "vitest";
import th from "./messages/th";

const ALLOWED = /^(Kanfangji|KANFANGJI|https?:\/\/\S+|[\d\s{}.,:/+-]+|v\d+)$/i;

function walk(value: unknown, path: string, failures: string[]) {
  if (typeof value === "string") {
    const withoutPlaceholders = value.replace(/\{[a-zA-Z0-9_]+\}/g, "");
    const asciiOnly = /^[\x00-\x7F]+$/.test(value);
    const placeholderOnly = /^[\d\s{}.,:/+-]*$/.test(withoutPlaceholders);
    if (asciiOnly && !placeholderOnly && !ALLOWED.test(value)) failures.push(`${path}=${value}`);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`, failures);
}

describe("Thai copy", () => {
  it("does not leave chat or compare values in English", () => {
    const failures: string[] = [];
    walk(th.chat, "chat", failures);
    walk(th.compare, "compare", failures);
    expect(failures).toEqual([]);
  });
});
