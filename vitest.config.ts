import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./lib/draft-db/test-setup.ts"],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      ...configDefaults.exclude,
      "e2e/**",
      ".worktrees/**",
      "lib/billing-status.test.ts",
      "lib/billing-guards.test.ts",
      "lib/billing-sync-select.test.ts",
      "lib/rate-limit.test.ts",
      "lib/supabase-write.test.ts",
      "lib/viewing-entitlement.test.ts",
    ],
    clearMocks: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
