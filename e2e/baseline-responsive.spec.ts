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
  await expect(page.getByText("看房資訊", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("login has no horizontal overflow", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "登入" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
