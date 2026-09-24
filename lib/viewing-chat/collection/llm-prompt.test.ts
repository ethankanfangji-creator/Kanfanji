import { describe, expect, it } from "vitest";
import {
  VIEWING_RECORDER_POLISH_RULES,
  VIEWING_RECORDER_REPORT_RULES,
  VIEWING_RECORDER_SYSTEM_PROMPT,
  viewingRecorderReportRules,
  viewingRecorderSystemPrompt,
} from "./llm-prompt";

describe("VIEWING_RECORDER_SYSTEM_PROMPT", () => {
  it("includes the twelve core product rules", () => {
    const p = VIEWING_RECORDER_SYSTEM_PROMPT;
    expect(p).toMatch(/看房紀錄助理/);
    expect(p).toMatch(/不是房仲/);
    expect(p).toMatch(/不是估價師/);
    expect(p).toMatch(/不要把推測當成事實/);
    expect(p).toMatch(/坪數/);
    expect(p).toMatch(/捷運距離/);
    expect(p).toMatch(/inferred|unknown/);
    expect(p).toMatch(/抽取所有相關欄位/);
    expect(p).toMatch(/跳過/);
    expect(p).toMatch(/改變話題|先保存新資訊/);
    expect(p).toMatch(/correction evidence|更正/);
    expect(p).toMatch(/最多三個/);
    expect(p).toMatch(/固定順序/);
    expect(p).toMatch(/Output language \(mandatory\)/);
    expect(p).toMatch(/Traditional Chinese|繁體中文/);
    expect(p).toMatch(/review|完成/);
    expect(p).not.toMatch(/房仲推薦/);
  });

  it("locks English when locale is en", () => {
    const p = viewingRecorderSystemPrompt("en");
    expect(p).toMatch(/Output language \(mandatory\)/);
    expect(p).toMatch(/English/);
    expect(p).not.toMatch(/繁體中文/);
  });

  it("exports polish and report variants with grounding rules", () => {
    expect(VIEWING_RECORDER_POLISH_RULES).toMatch(/不可新增事實/);
    expect(VIEWING_RECORDER_REPORT_RULES).toMatch(/不要聲稱所有資料完整/);
    expect(viewingRecorderReportRules("en")).toMatch(/English/);
  });
});
