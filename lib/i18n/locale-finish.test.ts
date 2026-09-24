import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE } from "./config";
import { DEFAULT_AI_LOCALE } from "@/lib/ai-boundary/locale";
import { getMessages } from "./index";
import { buildSupportMailto } from "./support-mailto";

describe("locale defaults", () => {
  it("defaults UI and AI locales to zh-Hant", () => {
    expect(DEFAULT_LOCALE).toBe("zh-Hant");
    expect(DEFAULT_AI_LOCALE).toBe("zh-Hant");
  });
});

describe("marketing + support copy localization", () => {
  it("localizes brand subtitle away from English OPEN HOUSE RECORDER for zh-Hant", () => {
    const zh = getMessages("zh-Hant");
    expect(zh.brand.subtitle).toBe("開放看房記錄");
    expect(zh.brand.subtitle).not.toBe("OPEN HOUSE RECORDER");
    expect(zh.brand.cardEyebrow).toContain("開放看房記錄");

    const en = getMessages("en");
    expect(en.brand.subtitle).toBe("OPEN HOUSE RECORDER");
  });

  it("keeps empty-state and AI highlight strings in the dictionary", () => {
    const zh = getMessages("zh-Hant");
    expect(zh.chat.emptyChat.length).toBeGreaterThan(0);
    expect(zh.chat.emptyHistory.length).toBeGreaterThan(0);
    expect(zh.wizard.aiHighlightDescription).toContain("現場");
    expect(zh.chat.generateReportFromSources).toContain("初步報告");
  });

  it("builds support mailto body from locale copy", () => {
    const zh = getMessages("zh-Hant");
    const href = buildSupportMailto({
      locale: "zh-Hant",
      email: null,
      copy: {
        contactSupport: zh.nav.contactSupport,
        supportAccountGuest: zh.nav.supportAccountGuest,
        supportAccountUser: zh.nav.supportAccountUser,
        supportDescribeIssue: zh.nav.supportDescribeIssue,
      },
    });
    expect(href.startsWith("mailto:")).toBe(true);
    const decoded = decodeURIComponent(href);
    expect(decoded).toContain("請描述問題");
    expect(decoded).toContain("帳號：訪客");
    expect(decoded).not.toContain("Please describe the issue");
  });
});
