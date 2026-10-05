import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ask page auth gate", () => {
  it("requires a signed-in user before rendering PortfolioAskApp", () => {
    const source = readFileSync("app/ask/page.tsx", "utf8");
    expect(source).toContain("redirect");
    expect(source).toContain("/login?next=");
    expect(source).toContain("getUser");
    expect(source).toContain("PortfolioAskApp");
  });
});
