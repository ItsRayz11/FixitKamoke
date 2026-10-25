import { defineConfig, devices } from "@playwright/test";

// Production-mode smoke run: real `next build` output, real Postgres wire protocol, no demo or test switches.
// Usage:  npm run build && npx playwright test -c playwright.prod.config.ts
const PORT = 3200;

export default defineConfig({
  testDir: "./e2e-prod",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "prod-desktop", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "node scripts/prod-smoke-server.mjs", url: `http://localhost:${PORT}`, timeout: 240_000, reuseExistingServer: false, env: { PORT: String(PORT) } },
});
