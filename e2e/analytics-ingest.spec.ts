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

async function trackOnPage(page: Page, region: "US" | "CA" | "TW" | "OTHER") {
  await page.waitForFunction(
    () =>
      typeof (window as Window & { __kfTrack?: unknown }).__kfTrack === "function",
  );
  await page.evaluate((nextRegion) => {
    const host = window as Window & {
      __kfTrack?: (event: { name: string; props: { region: string } }) => void;
    };
    host.__kfTrack?.({ name: "address_search_started", props: { region: nextRegion } });
  }, region);
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

test("A stays at zero requests and empty PostHog storage before consent", async ({ page }) => {
  const ingest: Hit[] = [];
  const blocked: string[] = [];
  await recordPosthog(page, ingest, blocked);
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport).toBeTruthy();
  if (box && viewport) {
    const dx = Math.abs(box.x + box.width / 2 - viewport.width / 2);
    const dy = Math.abs(box.y + box.height / 2 - viewport.height / 2);
    expect(dx).toBeLessThanOrEqual(viewport.width * 0.2);
    expect(dy).toBeLessThanOrEqual(viewport.height * 0.2);
  }
  await searchAddress(page);
  await page.goto("/login");
  await page.goto("/auth/forgot");
  await page.waitForTimeout(3000);
  expect(ingest).toHaveLength(0);
  expect(blocked).toHaveLength(0);
  await expect(posthogStorage(page)).resolves.toEqual({ keys: [], cookies: [] });
});

test("B stays at zero after declining and two reloads", async ({ page }) => {
  const ingest: Hit[] = [];
  const blocked: string[] = [];
  await recordPosthog(page, ingest, blocked);
  await page.goto("/");
  await page.getByRole("button", { name: "拒絕" }).click();
  await searchAddress(page);
  for (let time = 0; time < 2; time += 1) {
    await page.reload();
    await searchAddress(page);
  }
  expect(ingest).toHaveLength(0);
  expect(blocked).toHaveLength(0);
  await expect(posthogStorage(page)).resolves.toEqual({ keys: [], cookies: [] });
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("C sends ingest only after agreeing and skips remote extras", async ({ page }) => {
  const ingest: Hit[] = [];
  const blocked: string[] = [];
  await recordPosthog(page, ingest, blocked);
  await page.goto("/");
  await page.getByRole("button", { name: "同意" }).click();
  await searchAddress(page);
  await expect.poll(() => ingest.length, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(blocked).toHaveLength(0);
  const body = ingest.map((hit) => hit.body).join("\n");
  expect(body).not.toContain("$opt_in");
  expect(body).toContain("address_search_started");
});

test("D clears PostHog storage when analytics is turned off", async ({ page }) => {
  const ingest: Hit[] = [];
  const blocked: string[] = [];
  await recordPosthog(page, ingest, blocked);
  await page.goto("/");
  await page.getByRole("button", { name: "同意" }).click();
  await searchAddress(page);
  await expect.poll(() => ingest.length, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.getByRole("button", { name: "登入" }).click();
  await page.getByRole("checkbox", { name: "使用分析" }).uncheck();
  await expect(posthogStorage(page)).resolves.toEqual({ keys: [], cookies: [] });
  const afterRevoke = ingest.length;
  await page.reload();
  await searchAddress(page);
  await page.waitForTimeout(1500);
  expect(ingest).toHaveLength(afterRevoke);
  expect(blocked).toHaveLength(0);
});

test("E does not send tokens or urls from secret routes", async ({ page }) => {
  const ingest: Hit[] = [];
  const blocked: string[] = [];
  await recordPosthog(page, ingest, blocked);
  await page.goto("/");
  await page.getByRole("button", { name: "同意" }).click();
  const routes = ["/s/tok_S3CRET", "/c/tok_S3CRET", "/invite/tok_S3CRET", "/auth/reset?code=tok_S3CRET&x=1"];
  const regions = ["US", "CA", "TW", "OTHER"] as const;
  for (const [index, route] of routes.entries()) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await trackOnPage(page, regions[index] ?? "OTHER");
  }
  await page.evaluate(() => {
    const host = window as Window & { __kfIdentify?: (userId: string) => void };
    host.__kfIdentify?.("user-1");
  });
  await expect.poll(() => ingest.length, { timeout: 10_000 }).toBeGreaterThan(0);
  const body = ingest.map((hit) => hit.body).join("\n");
  expect(body).not.toContain("tok_S3CRET");
  expect(body).not.toContain("current_url");
  expect(body).not.toContain("pathname");
  expect(body).not.toContain("$referrer");
  expect(body).not.toContain("utm_");
});

test("F centers the dialog and opens privacy without trapping that page", async ({ page }) => {
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport).toBeTruthy();
  if (box && viewport) {
    expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(
      viewport.width * 0.2,
    );
    expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(
      viewport.height * 0.2,
    );
  }
  const buttons = dialog.getByRole("button");
  const deny = await buttons.nth(0).boundingBox();
  const allow = await buttons.nth(1).boundingBox();
  expect(deny && allow).toBeTruthy();
  if (deny && allow) {
    expect(Math.abs(deny.width - allow.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(deny.height - allow.height)).toBeLessThanOrEqual(2);
  }
  await dialog.getByRole("link", { name: "隱私權說明" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole("dialog")).toBeVisible();
});
