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
    // Fresh throwaway DB, committed migrations applied non-interactively,
    // then a true production build of the app under test.
    command:
      "node -e \"require('fs').rmSync('e2e.db',{force:true})\" && npx prisma migrate deploy && npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      DATABASE_URL: "file:./e2e.db",
      ALLOW_LOCAL_TARGETS: "true",
      SCAN_TIMEOUT_MS: "25000",
      CRAWLER_USER_AGENT: "GPTBot/1.0",
    },
  },
});
