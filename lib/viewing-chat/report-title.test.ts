import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHAT_REPORT_TITLE,
  resolveChatReportTitle,
} from "./report-title";

describe("resolveChatReportTitle", () => {
  it("returns the default for empty titles", () => {
    expect(resolveChatReportTitle(null)).toBe(DEFAULT_CHAT_REPORT_TITLE);
    expect(resolveChatReportTitle("")).toBe(DEFAULT_CHAT_REPORT_TITLE);
  });

  it("strips address prefixes before 看房評估報告", () => {
    expect(resolveChatReportTitle("3556 Copley Street — 看房評估報告")).toBe(
      DEFAULT_CHAT_REPORT_TITLE,
    );
    expect(resolveChatReportTitle("1167 Victory Drive - 看房评估报告")).toBe(
      DEFAULT_CHAT_REPORT_TITLE,
    );
  });

  it("keeps the bare default title", () => {
    expect(resolveChatReportTitle("看房評估報告")).toBe(DEFAULT_CHAT_REPORT_TITLE);
  });

  it("keeps unrelated custom titles", () => {
    expect(resolveChatReportTitle("現場重點摘要")).toBe("現場重點摘要");
  });
});
