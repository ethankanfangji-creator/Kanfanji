import { expect, test } from "@playwright/test";
import { mockGuestAuth } from "./helpers/baseline";

const STORAGE_KEY = "kanfangji.viewingChat.threads.v1";
const THREAD_ID = "mic-auto-submit-e2e";

test.beforeEach(async ({ page }) => {
  await mockGuestAuth(page);
});

test("desktop: stop mic recording auto-submits a note without pressing Send", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chrome",
    "Mic auto-submit verification runs on desktop Chrome only.",
  );

  const now = new Date().toISOString();
  const thread = {
    id: THREAD_ID,
    address: "Mic Auto Submit St",
    normalizedAddress: "Mic Auto Submit St",
    createdAt: now,
    updatedAt: now,
    messages: [],
    report: null,
    metadata: null,
    pinned: false,
  };

  await page.addInitScript(
    ({ key, row, locale }) => {
      localStorage.setItem("kanfangji.locale", locale);
      localStorage.setItem(key, JSON.stringify([row]));

      class FakeMediaRecorder {
        state = "inactive";
        mimeType = "audio/webm";
        ondataavailable: ((event: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;
        start() {
          this.state = "recording";
          Promise.resolve().then(() => {
            if (this.state !== "recording") return;
            this.ondataavailable?.({
              data: new Blob([new Uint8Array([1, 2, 3, 4])], {
                type: "audio/webm",
              }),
            });
          });
        }
        requestData() {
          this.ondataavailable?.({
            data: new Blob([new Uint8Array([9])], { type: "audio/webm" }),
          });
        }
        stop() {
          this.state = "inactive";
          // Chrome-like async final chunk then stop.
          Promise.resolve().then(() => {
            this.ondataavailable?.({
              data: new Blob([new Uint8Array([5, 6, 7, 8, 9])], {
                type: "audio/webm",
              }),
            });
            this.onstop?.();
          });
        }
        static isTypeSupported() {
          return true;
        }
      }

      // @ts-expect-error test stub
      window.MediaRecorder = FakeMediaRecorder;
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async () =>
            ({
              getTracks: () => [{ stop() {} }],
            }) as unknown as MediaStream,
        },
      });
    },
    { key: STORAGE_KEY, row: thread, locale: "zh-Hant" },
  );

  // Transcribe can be slow/fail — note must still appear from local save first.
  await page.route("**/api/viewing-chat/transcribe-note", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ transcript: "自動送出測試錄音" }),
    });
  });
  await page.route("**/api/viewing-chat/briefing", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        briefing: {
          address: "Mic Auto Submit St",
          summary: "測試簡報",
          sources: [],
          generatedAt: new Date().toISOString(),
        },
      }),
    });
  });

  await page.goto(`/viewings/${THREAD_ID}`);
  // Guest-local thread must paint without waiting on auth.
  await expect(page.getByRole("heading", { name: "Mic Auto Submit St" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { name: "現場筆記" })).toBeVisible();

  await page.getByRole("button", { name: "錄音中" }).click();
  await expect(page.getByRole("button", { name: "停止" })).toBeVisible();
  await page.getByRole("button", { name: "停止" }).click();

  // Note must appear without clicking Send (transcribing status and/or transcript).
  await expect(
    page
      .getByRole("region", { name: "現場筆記" })
      .getByText(/語音轉文字中|自動送出測試錄音/),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "送出" })).toBeDisabled();
  await expect(page.getByText("同步失敗")).toHaveCount(0);

  const stored = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Array<{ id?: string; messages?: unknown[] }>) : [];
  }, STORAGE_KEY);
  const saved = stored.find((row) => row.id === THREAD_ID);
  expect(saved?.messages?.length).toBeGreaterThanOrEqual(1);
});
