import { expect, test } from "@playwright/test";
import {
  expectCriticalControlsHaveNames,
  fillDateTimeLocal,
  isCoreProject,
  mockGuestAuth,
} from "./helpers/baseline";

test.beforeEach(async ({}, testInfo) => {
  test.skip(!isCoreProject(testInfo), "Core behavior runs once per browser engine.");
});

test("critical controls expose accessible names", async ({ page }) => {
  await mockGuestAuth(page);
  await page.goto("/");

  await expectCriticalControlsHaveNames(page);
  await expect(page.getByRole("button", { name: /STEP 1.*建立紀錄/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /STEP 2.*現場記錄/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /STEP 3.*分享卡片/ })).toBeEnabled();
});

test("login form supports keyboard navigation and activation", async ({ page }) => {
  await mockGuestAuth(page);
  await page.goto("/login");

  const email = page.getByPlaceholder("you@email.com");
  const password = page.getByPlaceholder("密碼（至少 6 碼）");
  const submit = page.getByRole("button", { name: "登入", exact: true });
  await email.focus();
  await page.keyboard.press("Tab");
  await expect(password).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(submit).toBeFocused();

  const switchMode = page.getByRole("button", { name: "還沒有帳號？註冊" });
  await switchMode.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "建立帳號" })).toBeVisible();
  await expect(page.getByRole("button", { name: "註冊", exact: true })).toBeVisible();
});

test("guest can advance through the local wizard", async ({ page }) => {
  await mockGuestAuth(page);
  await page.goto("/");

  await page.getByPlaceholder("輸入看房地址…").fill("Baseline Test Address");
  await fillDateTimeLocal(page, /看房日期與時間/, "2026-09-17T10:30");
  await page.getByRole("button", { name: "下一步" }).click();

  await expect(page.getByText("TEXT 文字筆記", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "上一步" })).toBeVisible();
  await expect(page.getByText(/可先記錄|尚未設定金鑰/)).toBeVisible();
});

test("reload restores the guest wizard draft", async ({ page }) => {
  await mockGuestAuth(page);
  await page.goto("/");

  const address = page.getByPlaceholder("輸入看房地址…");
  await address.fill("Reload Restore Baseline");
  await fillDateTimeLocal(page, /看房日期與時間/, "2026-09-18T14:45");
  await page.getByRole("button", { name: "下一步" }).click();
  await expect(page.getByText("TEXT 文字筆記", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("TEXT 文字筆記", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /STEP 1.*建立紀錄/ }).click();
  await expect(address).toHaveValue("Reload Restore Baseline");
  await expect(page.getByLabel(/看房日期與時間/)).toHaveValue("2026-09-18T14:45");
});

test("guest viewing detail redirects to login", async ({ page }) => {
  await mockGuestAuth(page);
  await page.goto("/viewings/not-a-real-record");

  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await expect(page.getByRole("heading", { name: "登入" })).toBeVisible();
});

test("login exposes loading and safe error states without a real account", async ({ page }, testInfo) => {
  await mockGuestAuth(page);
  let releaseResponse: () => void = () => {};
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await page.route("**/auth/v1/token**", async (route) => {
    await responseGate;
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      },
      body: JSON.stringify({ message: "Baseline simulated auth failure" }),
    });
  });

  await page.goto("/login");
  const email = page.getByPlaceholder("you@email.com");
  const password = page.getByPlaceholder("密碼（至少 6 碼）");
  await email.pressSequentially("nobody@example.invalid");
  await password.pressSequentially("not-a-real-password");
  await expect(email).toHaveValue("nobody@example.invalid");
  await expect(password).toHaveValue("not-a-real-password");
  await page.getByRole("button", { name: "登入", exact: true }).click();
  if (testInfo.project.name === "desktop-chrome") {
    await expect(page.getByRole("button", { name: "處理中..." })).toBeDisabled();
  }

  releaseResponse();
  await expect(
    page.getByRole("status").filter({
      hasText: /Baseline simulated auth failure|Load failed/,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "登入", exact: true })).toBeEnabled();
});

test("missing local comparison renders an empty-state smoke screen", async ({ page }) => {
  await mockGuestAuth(page);
  await page.goto("/c/playwright-local-missing");

  await expect(page.getByRole("heading", { name: "無法開啟比較" })).toBeVisible();
  await expect(page.getByRole("link", { name: "回首頁" })).toBeVisible();
});
