import { expect, test, type Page } from "@playwright/test";
import { mockGuestAuth } from "./helpers/baseline";

type Hit = { url: string; body: string };

const POSTHOG = /https:\/\/([a-z0-9-]+\.)*posthog\.com\/.*/;
const INGEST = /\/(?:i\/v0\/e|e|batch|capture)\/?$/;

function recordPosthog(page: Page, ingest: Hit[], blocked: string[]) {
  return page.route(POSTHOG, async (route) => {
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
  await page.getByPlaceholder(/輸入看房地址|Enter viewing address/).evaluate((element) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, "888 Maple");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await pending;
}

async function posthogStorage(page: Page) {
  return page.evaluate(() => {
    const keys: string[] = [];
    for (const [label, store] of [
      ["local", localStorage],
      ["session", sessionStorage],
    ] as const) {
      for (let index = 0; index < store.length; index += 1) {
        const key = store.key(index);
        if (key && (key.startsWith("ph_") || key.startsWith("__ph_"))) keys.push(`${label}:${key}`);
      }
    }
    const cookies = document.cookie
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part.startsWith("ph_") || part.startsWith("__ph_"));
    return { keys, cookies };
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "webdriver", {
      configurable: true,
      get: () => false,
    });
    localStorage.setItem("kanfangji.analytics.consent.v1", "granted");
  });
  await mockGuestAuth(page);
  await mockSuggest(page);
});

test("guests are not asked and do not send analytics", async ({ page }) => {
  const ingest: Hit[] = [];
  const blocked: string[] = [];
  await recordPosthog(page, ingest, blocked);
  await page.goto("/");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await searchAddress(page);
  await page.goto("/login?mode=signup");
  const consent = page.getByRole("checkbox");
  await expect(consent).toBeVisible();
  await expect(consent).not.toBeChecked();
  await expect(page.getByRole("link", { name: "隱私權說明" })).toBeVisible();
  await page.waitForTimeout(1500);
  expect(ingest).toHaveLength(0);
  expect(blocked).toHaveLength(0);
  await expect(posthogStorage(page)).resolves.toEqual({ keys: [], cookies: [] });
});

test("a leftover local grant still sends nothing for a guest", async ({ page }) => {
  const ingest: Hit[] = [];
  const blocked: string[] = [];
  await recordPosthog(page, ingest, blocked);
  await page.goto("/");
  await searchAddress(page);
  await page.reload();
  await searchAddress(page);
  expect(ingest).toHaveLength(0);
  expect(blocked).toHaveLength(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
