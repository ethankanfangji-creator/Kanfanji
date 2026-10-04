import { describe, expect, it } from "vitest";
import {
  buildHistoryForAsk,
  findLastUserQuestion,
  formatHistoryForPrompt,
  historyExcludingTrailingAssistant,
  parseRewriteHint,
  rewriteHintInstruction,
} from "./context";
import type { PortfolioChatTurn } from "./types";

const turns: PortfolioChatTurn[] = [
  { id: "1", role: "user", text: "150萬以下？", createdAt: "a" },
  { id: "2", role: "assistant", text: "有兩間", createdAt: "b", matchedIds: ["v1"] },
  { id: "3", role: "user", text: "哪間潮濕？", createdAt: "c" },
  { id: "4", role: "assistant", text: "第一間", createdAt: "d" },
];

describe("portfolio context", () => {
  it("builds a bounded history for the model", () => {
    const history = buildHistoryForAsk(turns, 3);
    expect(history).toHaveLength(3);
    expect(history[0].text).toBe("有兩間");
  });

  it("drops trailing assistant for rewrite", () => {
    const next = historyExcludingTrailingAssistant(turns);
    expect(next).toHaveLength(3);
    expect(findLastUserQuestion(next)).toBe("哪間潮濕？");
  });

  it("formats prior turns and rewrite hints", () => {
    expect(formatHistoryForPrompt(buildHistoryForAsk(turns, 2))).toContain("PRIOR_TURNS");
    expect(parseRewriteHint("shorter")).toBe("shorter");
    expect(parseRewriteHint("nope")).toBeNull();
    expect(rewriteHintInstruction("matches_only")).toMatch(/matching homes/i);
  });
});
