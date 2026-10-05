import { describe, expect, it } from "vitest";
import { classifyAskQuestionThemes } from "./question-themes";

describe("classifyAskQuestionThemes", () => {
  it("tags budget and family preference questions", () => {
    expect(classifyAskQuestionThemes("一百五十萬以下的有哪幾間？")).toContain("budget");
    expect(classifyAskQuestionThemes("媽媽比較喜歡哪間？")).toEqual(
      expect.arrayContaining(["family_preference"]),
    );
  });

  it("tags risk and compare", () => {
    expect(classifyAskQuestionThemes("哪幾間提到潮濕或漏水？")).toContain("risk");
    expect(classifyAskQuestionThemes("這幾間差在哪？幫我對照")).toContain("compare");
  });

  it("falls back to other for empty or unrelated text", () => {
    expect(classifyAskQuestionThemes("")).toEqual(["other"]);
    expect(classifyAskQuestionThemes("hello")).toEqual(["other"]);
  });
});
