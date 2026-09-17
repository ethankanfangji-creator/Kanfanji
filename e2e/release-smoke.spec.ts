import { expect, test } from "@playwright/test";
import { isCoreProject } from "./helpers/baseline";

test.beforeEach(async ({}, testInfo) => {
  test.skip(!isCoreProject(testInfo), "Release smoke runs once per browser engine.");
});

test("guest local wizard renders with accessible controls", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "建立新的看房紀錄" })).toBeVisible();
  await expect(page.getByPlaceholder("輸入看房地址…")).toBeVisible();
  await expect(page.getByRole("button", { name: "Lookup address" })).toBeVisible();
  await expect(page.getByRole("link", { name: /看房紀錄/ })).toBeVisible();
  await expect(page.getByLabel(/看房日期與時間/)).toBeVisible();
  await expect(page.getByText(/可先記錄|尚未設定金鑰/)).toBeVisible();
});

test("manifest and offline fallback are available", async ({ page, request }) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  expect(manifestResponse.headers()["content-type"]).toContain("application/manifest+json");
  await expect(manifestResponse.json()).resolves.toMatchObject({
    name: "看房記 KanFangJi",
    start_url: "/",
    display: "standalone",
  });

  await page.goto("/offline");
  await expect(page.getByRole("heading", { name: "目前離線" })).toBeVisible();
  await expect(page.getByRole("link", { name: "看房記 KanFangJi" })).toBeVisible();
});

test("public share pages are excluded from browser and service-worker caches", async ({
  page,
  request,
}) => {
  const serviceWorker = await request.get("/sw.js");
  expect(serviceWorker.ok()).toBe(true);
  const source = await serviceWorker.text();
  expect(source).toContain('"/s/"');
  expect(source).toContain('"/c/"');

  for (const path of ["/s/playwright-cache-probe", "/c/playwright-cache-probe"]) {
    const response = await page.goto(path);
    expect(response, `${path} should return a document response`).not.toBeNull();
    expect(response?.headers()["cache-control"] ?? "").toMatch(/private|no-store|no-cache/i);
  }
});
