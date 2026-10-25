import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Dev-server pages compile on first visit, so allow for cold starts.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { NEXT_PUBLIC_DEMO_MODE: "1", FIXIT_PGLITE_DIR: "memory://", NEXT_PUBLIC_WHATSAPP_NUMBER: "920000000000", ADMIN_SETUP_TOKEN: "e2e-setup-token-0123456789" },
  },
});
