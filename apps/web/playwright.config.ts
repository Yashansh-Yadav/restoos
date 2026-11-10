import { defineConfig, devices } from "@playwright/test";

// E2E tests (plan §12). Uses the installed Google Chrome (`channel: "chrome"`), so no browser
// download is needed locally; GitHub's Ubuntu runners ship Chrome too.
const isCI = Boolean(process.env.CI);
const WEB_URL = "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Locally `next dev` compiles each page on first visit; many parallel browsers hitting a cold
  // dev server time out. CI runs the pre-built app, so it can use more workers.
  workers: isCI ? 4 : 2,
  timeout: isCI ? 30_000 : 90_000,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    {
      // Our primary target: a low-end Android phone held one-handed.
      name: "mobile-360",
      use: { ...devices["Pixel 7"], channel: "chrome", viewport: { width: 360, height: 780 } },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @restoos/api start",
      url: "http://localhost:4000/api/health",
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      // CI tests the production build (`pnpm build` runs first); locally the dev server.
      command: isCI ? "pnpm start" : "pnpm dev",
      url: WEB_URL,
      reuseExistingServer: !isCI,
      timeout: 180_000,
    },
  ],
});
