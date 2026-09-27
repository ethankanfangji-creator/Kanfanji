// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/I18nProvider";
import { ConsentBanner } from "./ConsentBanner";

const nav = vi.hoisted(() => ({ path: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
}));

const COPY = {
  "zh-Hant": {
    body: "幫助我們提升用戶體驗，同意收集匿名用戶使用情況。詳請見",
    link: "隱私權說明",
    allow: "同意",
    deny: "拒絕",
  },
  "zh-Hans": {
    body: "帮助我们提升用户体验，同意收集不具名用户使用情况。详情请见",
    link: "隐私权说明",
    allow: "同意",
    deny: "拒绝",
  },
  en: {
    body: "Help us improve your experience by allowing us to collect anonymous usage data. See our",
    link: "Privacy notice",
    allow: "Agree",
    deny: "Decline",
  },
  th: {
    body: "ช่วยเราปรับปรุงประสบการณ์การใช้งาน โดยยินยอมให้เก็บข้อมูลการใช้งานแบบไม่ระบุตัวตน ดูรายละเอียดได้ที่",
    link: "ความเป็นส่วนตัว",
    allow: "ยินยอม",
    deny: "ปฏิเสธ",
  },
} as const;

function renderBanner() {
  return render(
    <I18nProvider>
      <ConsentBanner />
    </I18nProvider>,
  );
}

describe("ConsentBanner", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    nav.path = "/";
    localStorage.clear();
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    Object.defineProperty(navigator, "globalPrivacyControl", {
      configurable: true,
      value: false,
    });
  });

  it("shows the four languages, a privacy link, and equal dialog buttons", async () => {
    for (const [locale, copy] of Object.entries(COPY)) {
      localStorage.setItem("kanfangji.locale", locale);
      const view = renderBanner();
      await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
      expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
      expect(screen.getByText(new RegExp(copy.body.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeVisible();
      expect(screen.getByRole("link", { name: copy.link })).toHaveAttribute("href", "/privacy");
      const buttons = screen.getAllByRole("button");
      expect(buttons.map((button) => button.textContent)).toEqual([copy.deny, copy.allow]);
      expect(buttons[0]?.className).toBe(buttons[1]?.className);
      view.unmount();
    }
  });

  it("hides on the privacy page", async () => {
    nav.path = "/privacy";
    renderBanner();
    await Promise.resolve();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not store consent when Escape is pressed", async () => {
    renderBanner();
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dialog).toBeVisible();
    expect(localStorage.getItem("kanfangji.analytics.consent.v1")).toBeNull();
  });
});
