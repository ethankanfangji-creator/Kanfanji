import { defineConfig, devices } from "@playwright/test";

const port = 3200;
const baseURL = `http://127.0.0.1:${port}`;
const buildEnv =
  "NEXT_PUBLIC_POSTHOG_KEY=phc_e2e_dummy NEXT_PUBLIC_ANALYTICS_ALLOW_AUTOMATION=1";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "analytics-ingest.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL,
    locale: "zh-TW",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `${buildEnv} npm run build && ${buildEnv} npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
