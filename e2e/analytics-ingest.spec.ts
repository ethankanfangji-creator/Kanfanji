import { expect, test, type Page } from "@playwright/test";
import { mockGuestAuth } from "./helpers/baseline";

type Hit = { url: string; body: string };

const INGEST = /\/(?:i\/v0\/e|e|batch|capture)\/?$/;

function recordPosthog(page: Page, ingest: Hit[], blocked: string[]) {
  return page.route(/https:\/\/[a-z0-9-]+\.i\.posthog\.com\/.*/, async (route) => {
    const request = route.request();
    const url = request.url();
    if (INGEST.test(new URL(url).pathname)) {
      ingest.push({ url, body: request.postData() ?? "" });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: 1 }),
      });
      return;
    }
    blocked.push(url);
    await route.abort();
  });
}

async function mockSuggest(page: Page) {
  await page.route("**/api/address-suggest**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ suggestions: [], region: "CA" }),
    });
  });
}

async function searchAddress(page: Page) {
  const pending = page.waitForResponse((response) =>
    response.url().includes("/api/address-suggest"),
  );
  await page.getByPlaceholder(/輸入看房地址|Enter viewing address/).fill("888 Maple");
  await pending;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "webdriver", {
      configurable: true,
      get: () => false,
    });
  });
  await mockGuestAuth(page);
  await mockSuggest(page);
});

test("does not contact PostHog before consent", async ({ page }) => {
  const ingest: Hit[] = [];
  const blocked: string[] = [];
  await recordPosthog(page, ingest, blocked);
  await page.goto("/");
  await expect(page.getByRole("button", { name: /允許|Allow/ })).toBeVisible();
  await searchAddress(page);
  await page.waitForTimeout(1500);
  expect(ingest).toHaveLength(0);
  expect(blocked).toHaveLength(0);
});

test("sends one ingest after consent and loads no remote extras", async ({ page }) => {
  const ingest: Hit[] = [];
  const blocked: string[] = [];
  await recordPosthog(page, ingest, blocked);
  await page.goto("/");
  await page.getByRole("button", { name: /允許|Allow/ }).click();
  await searchAddress(page);
  await expect.poll(() => ingest.length, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(blocked).toHaveLength(0);
  const body = ingest.map((hit) => hit.body).join("\n");
  expect(body).toContain("address_search_started");
  expect(body.toLowerCase()).not.toContain("current_url");
  expect(body.toLowerCase()).not.toContain("currenturl");
  expect(body.toLowerCase()).not.toContain("pathname");
  expect(body).not.toContain("$referrer");
});

test("does not contact PostHog after consent is denied", async ({ page }) => {
  const ingest: Hit[] = [];
  const blocked: string[] = [];
  await recordPosthog(page, ingest, blocked);
  await page.goto("/");
  await page.getByRole("button", { name: /不要|No thanks/ }).click();
  await searchAddress(page);
  await page.waitForTimeout(1500);
  expect(ingest).toHaveLength(0);
  expect(blocked).toHaveLength(0);
});
