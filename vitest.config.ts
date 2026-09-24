import path from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  test: {
    environment: "node",
    setupFiles: [path.join(root, "lib/draft-db/test-setup.ts")],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: [...configDefaults.exclude, "e2e/**"],
    clearMocks: true,
  },
  resolve: {
    alias: {
      "@": root,
    },
  },
});
