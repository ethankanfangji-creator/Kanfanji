import path from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

/** node:test files — run via `npm run test:node`, not vitest. */
const nodeTestOnly = [
  "lib/billing-status.test.ts",
  "lib/billing-guards.test.ts",
  "lib/billing-sync-select.test.ts",
  "lib/rate-limit.test.ts",
  "lib/supabase-write.test.ts",
  "lib/viewing-entitlement.test.ts",
];

export default defineConfig({
  root,
  test: {
    environment: "node",
    setupFiles: [path.join(root, "lib/draft-db/test-setup.ts")],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      ...configDefaults.exclude,
      "e2e/**",
      ".worktrees/**",
      ...nodeTestOnly,
    ],
    clearMocks: true,
  },
  resolve: {
    alias: {
      "@": root,
    },
  },
});
