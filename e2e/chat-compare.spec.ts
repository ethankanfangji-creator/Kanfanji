import { expect, test } from "@playwright/test";
import { mockGuestAuth } from "./helpers/baseline";

const STORAGE_KEY = "kanfangji.viewingChat.threads.v1";

function seedThread(id: string, address: string, price: string) {
  const now = "2026-09-01T02:30:00.000Z";
  return {
    id,
    address,
    normalizedAddress: address,
    createdAt: now,
    updatedAt: now,
    messages: [],
    report: null,
    metadata: null,
    pinned: false,
    propertyRecord: {
      mode: "collecting",
      updatedAt: now,
      fields: {
        price: {
          fieldId: "price",
          value: price,
          status: "confirmed",
          confidence: 1,
          sourceMessageId: null,
          rawText: price,
          updatedAt: now,
        },
      },
    },
  };
}

test.beforeEach(async ({ page }) => {
  await mockGuestAuth(page);
});

test("390px history compare opens a local side-by-side without calling the API", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-390-chrome",
    "Phone compare flow runs on the 390 Chrome project.",
  );

  const threads = [
    seedThread("cmp-a", "松山一號", "1000萬"),
    seedThread("cmp-b", "大安二號", "900萬"),
    seedThread("cmp-c", "信義三號", "1000萬"),
  ];
  await page.addInitScript(
    ({ key, rows }) => {
      localStorage.setItem("kanfangji.locale", "zh-Hant");
      localStorage.setItem(key, JSON.stringify(rows));
    },
    { key: STORAGE_KEY, rows: threads },
  );

  const apiHits: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return;
    if (request.frame().url().includes("/compare")) apiHits.push(url.pathname);
  });

  await page.goto("/");
  const history = page.getByRole("dialog", { name: "看房歷史" });
  await page.getByRole("button", { name: "歷史" }).click();
  await history.getByRole("button", { name: "比較", exact: true }).click();
  await history.getByRole("checkbox", { name: /松山一號/ }).click();
  await history.getByRole("checkbox", { name: /大安二號/ }).click();
  await history.getByRole("checkbox", { name: /信義三號/ }).click();
  await history.getByRole("button", { name: "比較 (3)" }).click();
  await expect(page.getByRole("heading", { name: "比較看房" })).toBeVisible();
  await expect(page.locator("[data-testid=compare-column]:visible")).toHaveCount(3);
  const scroller = page.getByTestId("compare-scroller");
  await expect
    .poll(async () =>
      scroller.evaluate((element) => element.scrollWidth > element.clientWidth + 8),
    )
    .toBe(true);
  await expect(page.locator("[data-compare-diff=true]:visible").first()).toBeVisible();
  await expect(page.getByText("推薦")).toHaveCount(0);
  await expect(page.getByText("較好")).toHaveCount(0);
  await expect(page.getByText("勝出")).toHaveCount(0);
  expect(apiHits).toEqual([]);
});

test("desktop compare table keeps the first column sticky", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chrome",
    "Desktop sticky column runs on desktop Chrome.",
  );

  await page.setViewportSize({ width: 1280, height: 800 });
  const threads = [
    seedThread("cmp-a", "松山一號", "1000萬"),
    seedThread("cmp-b", "大安二號", "900萬"),
  ];
  await page.addInitScript(
    ({ key, rows }) => {
      localStorage.setItem("kanfangji.locale", "zh-Hant");
      localStorage.setItem(key, JSON.stringify(rows));
    },
    { key: STORAGE_KEY, rows: threads },
  );

  await page.goto("/");
  await page.getByRole("button", { name: "比較", exact: true }).click();
  await page.getByRole("checkbox", { name: /松山一號/ }).click();
  await page.getByRole("checkbox", { name: /大安二號/ }).click();
  await page.getByRole("button", { name: "比較 (2)" }).click();
  await expect(page.getByRole("heading", { name: "比較看房" })).toBeVisible();
  await expect(page.locator("table th").first()).toHaveCSS("position", "sticky");
});
