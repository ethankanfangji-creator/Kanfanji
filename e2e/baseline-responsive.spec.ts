import { expect, test } from "@playwright/test";
import {
  expectNoHorizontalOverflow,
  mockGuestAuth,
} from "./helpers/baseline";

test.beforeEach(async ({ page }) => {
  await mockGuestAuth(page);
});

test("home has no horizontal overflow", async ({ page }, testInfo) => {
  test.info().annotations.push({
    type: "viewport",
    description: `${testInfo.project.name}: ${testInfo.project.use.viewport?.width ?? "device"}px`,
  });

  await page.goto("/");
  await expect(page.getByText("建立新的看房紀錄", { exact: true }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("step 1 form stays within 375/390/430 viewports", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-390-chrome",
    "Phone-width overflow coverage for Step 1 runs once on mobile Chrome.",
  );
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "建立新的看房紀錄" })).toBeVisible();
    await page.getByLabel(/看房日期與時間/).fill("2026-09-17T10:30");
    await expectNoHorizontalOverflow(page);
  }
});

test("login has no horizontal overflow", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "登入" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
