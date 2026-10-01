import { describe, expect, it } from "vitest";
import {
  VIEWING_RECORDER_POLISH_RULES,
  VIEWING_RECORDER_REPORT_RULES,
  VIEWING_RECORDER_SYSTEM_PROMPT,
  viewingRecorderReportRules,
  viewingRecorderSystemPrompt,
} from "./llm-prompt";

describe("VIEWING_RECORDER_SYSTEM_PROMPT", () => {
  it("loads the Eagle prompt and forbids internal keys", () => {
    const p = VIEWING_RECORDER_SYSTEM_PROMPT;
    expect(p).toMatch(/You are Eagle/);
    expect(p).toMatch(/NEVER reveal internal keys like roof_material, water_damage/);
    expect(p).toMatch(/answered_keys/);
    expect(p).toMatch(/坪數, 公設比, 管理費/);
    expect(p).toContain("in TW");
  });

  it("locks English units when locale is en", () => {
    const p = viewingRecorderSystemPrompt("en");
    expect(p).toMatch(/HOA, property tax/);
    expect(p).toMatch(/Language en/);
    expect(p).not.toMatch(/\{\{address\}\}/);
  });

  it("exports polish and report variants with grounding rules", () => {
    expect(VIEWING_RECORDER_POLISH_RULES).toMatch(/不可新增事實/);
    expect(VIEWING_RECORDER_REPORT_RULES).toMatch(/不要說資料已經完整/);
    expect(viewingRecorderReportRules("en")).toMatch(/English/);
  });
});
