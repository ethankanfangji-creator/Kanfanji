import { expect, test } from "@playwright/test";
import { isCoreProject, mockGuestAuth } from "./helpers/baseline";

test.beforeEach(async ({}, testInfo) => {
  test.skip(!isCoreProject(testInfo), "Core behavior runs once per browser engine.");
});

async function mockPropertyApis(page: import("@playwright/test").Page) {
  await page.route("**/api/address-suggest**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        suggestions: [
          {
            label: "123 Main St, Seattle, WA 98101",
            description: "Seattle",
          },
        ],
      }),
    });
  });

  await page.route("**/api/property-intel", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        intel: {
          location: { lat: 47.6, lng: -122.3, label: "Seattle" },
          basics: {},
          costs: {},
          transit: [],
          schools: [],
          market: {},
          risks: [],
          visuals: {},
          sources: [],
          compliance: {},
        },
        report: null,
      }),
    });
  });

  await page.route("**/api/property-source/ingest", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        source: {
          sourceId: "e2e-src",
          sourceType: "listing_url",
          originalContent: "mock",
          extractedText: "3 bed 2 bath $899,000 HOA $200",
          sourceUrl: "https://example.com/listing/1",
          publisher: "example.com",
          retrievedAt: new Date().toISOString(),
          country: "US",
          language: "en",
          confidence: 0.6,
          extractionErrors: [],
        },
        sources: [
          {
            sourceId: "e2e-src",
            sourceType: "listing_url",
            originalContent: "mock",
            extractedText: "3 bed 2 bath $899,000",
            sourceUrl: "https://example.com/listing/1",
            publisher: "example.com",
            retrievedAt: new Date().toISOString(),
            country: "US",
            language: "en",
            confidence: 0.6,
            extractionErrors: [],
          },
        ],
        propertyData: {
          listing: { bedrooms: { value: 3 } },
        },
        steps: [
          {
            step: "extract",
            status: "completed",
            startedAt: null,
            completedAt: null,
            errorCode: null,
            errorMessage: null,
            sourceReferences: [],
            retryCount: 0,
          },
        ],
        conflicts: [],
        report: {
          reportStatus: "partial",
          propertySummary: {},
          dataCompleteness: {
            score: 0.3,
            missingFields: ["costs.propertyTax"],
            verifiedFields: [],
            unverifiedFields: ["listing.bedrooms"],
          },
          sections: [
            {
              id: "sec_summary",
              title: "房源摘要",
              kind: "summary",
              body: "Mock US listing",
            },
          ],
          risks: [],
          questionsToAsk: [],
          viewingChecklist: [],
          nextActions: [],
          sources: [],
          disclaimer: "test",
        },
        enrichNotes: ["外部資料尚未連接"],
      }),
    });
  });
}

test("A path: address → on-site capture (no listing chips)", async ({ page }) => {
  await mockGuestAuth(page);
  await mockPropertyApis(page);
  await page.goto("/");

  const address = page.getByPlaceholder(/輸入看房地址|Enter viewing address/);
  await expect(address).toBeVisible();
  await address.fill("123 Main St, Seattle, WA 98101");
  await page.getByRole("button", { name: /確認並開始|Confirm/ }).click();

  await expect(
    page.getByText(/一件一件來|One item at a time|ทีละข้อ/),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("button", { name: /幫我整理看房時要問仲介|Questions to ask the agent/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /進階：附加房源|Advanced: add listing/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /貼上房源連結|Paste listing URL/ }),
  ).toHaveCount(0);
});

test("A path: optional listing intake reveals collection chips", async ({ page }) => {
  await mockGuestAuth(page);
  await mockPropertyApis(page);
  await page.goto("/");

  await page.getByPlaceholder(/輸入看房地址|Enter viewing address/).fill(
    "456 Granville St, Vancouver, BC V6C 1V4",
  );
  await page.getByRole("button", { name: /確認並開始|Confirm/ }).click();
  await expect(
    page.getByRole("button", { name: /進階：附加房源|Advanced: add listing/ }),
  ).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: /進階：附加房源|Advanced: add listing/ }).click();
  await expect(
    page.getByRole("button", { name: /上傳房源截圖|Upload listing screenshot/ }),
  ).toBeVisible({ timeout: 10_000 });
});

test("Advanced: paste listing URL after opening intake", async ({ page }) => {
  await mockGuestAuth(page);
  await mockPropertyApis(page);
  await page.goto("/");

  await page
    .getByPlaceholder(/輸入看房地址|Enter viewing address/)
    .fill("台北市大安區忠孝東路四段1號");
  await page.getByRole("button", { name: /確認並開始|Confirm/ }).click();
  await expect(
    page.getByRole("button", { name: /進階：附加房源|Advanced: add listing/ }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /進階：附加房源|Advanced: add listing/ }).click();

  page.once("dialog", async (dialog) => {
    await dialog.accept("https://example.com/listing/tw-1");
  });
  await page.getByRole("button", { name: /貼上房源連結|Paste listing URL/ }).click();
  await expect(page.getByText(/已收到房源資料|Listing data received/)).toBeVisible({
    timeout: 15_000,
  });
});
