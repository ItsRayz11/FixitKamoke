import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { hookTimeout: 60_000, testTimeout: 30_000, include: ["tests/unit/**/*.test.{ts,tsx}", "tests/integration/**/*.test.ts"] },
});
