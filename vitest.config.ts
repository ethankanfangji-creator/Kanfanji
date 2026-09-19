import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./lib/draft-db/test-setup.ts"],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: [...configDefaults.exclude, "e2e/**"],
    clearMocks: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
