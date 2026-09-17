import { expect, type Page, type TestInfo } from "@playwright/test";

const CORE_PROJECTS = new Set(["desktop-chrome", "desktop-webkit"]);

export function isCoreProject(testInfo: TestInfo): boolean {
  return CORE_PROJECTS.has(testInfo.project.name);
}

export async function mockGuestAuth(page: Page): Promise<void> {
  await page.route(/\/auth\/v1\/user(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "guest baseline" }),
    });
  });
  await blockUnexpectedSupabaseTraffic(page);
}

async function blockUnexpectedSupabaseTraffic(page: Page): Promise<void> {
  await page.route(/^https:\/\/[^/]+\.supabase\.co\/.*$/, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/auth/v1/user" && request.method() === "GET") {
      await route.fallback();
      return;
    }
    await route.abort("blockedbyclient");
  });
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  const result = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => {
        const style = getComputedStyle(element);
        if (style.position === "fixed" || style.position === "sticky") return false;
        const rect = element.getBoundingClientRect();
        return rect.left < -1 || rect.right > viewportWidth + 1;
      })
      .slice(0, 8)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return `${element.tagName.toLowerCase()}.${element.className}: ${rect.left.toFixed(1)}..${rect.right.toFixed(1)}`;
      });

    return {
      clientWidth: viewportWidth,
      scrollWidth: document.documentElement.scrollWidth,
      offenders,
    };
  });

  expect(
    result.scrollWidth,
    `horizontal overflow at ${result.clientWidth}px; offenders: ${result.offenders.join(", ")}`,
  ).toBeLessThanOrEqual(result.clientWidth + 1);
}

export async function fillDateTimeLocal(
  page: Page,
  accessibleName: RegExp,
  value: string,
): Promise<void> {
  await page.getByLabel(accessibleName).evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

export async function expectCriticalControlsHaveNames(page: Page): Promise<void> {
  await expect(page.getByRole("navigation", { name: "Viewing wizard" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lookup address" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "語言" })).toBeVisible();
  await expect(page.getByRole("link", { name: /看房紀錄/ })).toBeVisible();
  await expect(page.getByLabel(/看房日期與時間/)).toBeVisible();

  const visibleUnnamed = await page
    .locator("button:visible, a[href]:visible, select:visible")
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const ariaLabel = element.getAttribute("aria-label")?.trim();
          const labelledBy = element.getAttribute("aria-labelledby")?.trim();
          const text = element.textContent?.trim();
          return !ariaLabel && !labelledBy && !text;
        })
        .map((element) => element.outerHTML.slice(0, 180)),
    );
  expect(visibleUnnamed, `visible controls without names: ${visibleUnnamed.join(", ")}`).toEqual([]);
}
