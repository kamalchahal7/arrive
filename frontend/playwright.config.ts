import { defineConfig, devices } from "@playwright/test";

// Accessibility and flow checks against the production build. The API is mocked in the tests (tests/fixtures.ts),
// so no backend or database is needed.
export default defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    ...devices["Pixel 7"],
    locale: "en-CA",
  },
  webServer: {
    command: "npx next start -p 3100",
    url: "http://localhost:3100/en",
    reuseExistingServer: true,
    timeout: 120_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 2_000 },
  },
});
