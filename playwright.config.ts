import { defineConfig, devices } from "@playwright/test";

// The e2e suite scans pages served by e2e/fixture-server.ts, so the app must
// be allowed to fetch localhost targets and uses a throwaway database.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command:
      "npm run build && npm run db:migrate -- --name e2e --skip-generate && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: "file:./e2e.db",
      ALLOW_LOCAL_TARGETS: "true",
      SCAN_TIMEOUT_MS: "25000",
      CRAWLER_USER_AGENT: "GPTBot/1.0",
    },
  },
});
