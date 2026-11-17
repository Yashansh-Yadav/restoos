import { defineConfig, devices } from "@playwright/test";

// E2E tests (plan §12). Uses the installed Google Chrome (`channel: "chrome"`), so no browser
// download is needed locally; GitHub's Ubuntu runners ship Chrome too.
//
// Always tests a PRODUCTION build, locally and in CI, on dedicated ports (web 3100, API 4100):
// `next dev`'s on-demand compiling + hot reload aborted navigations on a cold cache (M1-T1), and
// separate ports mean `pnpm dev` (3000/4000) is never reused or disturbed.
const isCI = Boolean(process.env.CI);
const WEB_PORT = 3100;
const API_PORT = 4100;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const API_URL = `http://localhost:${API_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: isCI ? 4 : 2,
  timeout: 60_000,
  expect: { timeout: 10_000 },
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
      // Same API code; its public origin (Better Auth baseURL / allowed origin) is the E2E web port.
      command: "pnpm --filter @restoos/api start",
      url: `${API_URL}/api/health`,
      // Every test signs in by OTP from the same machine IP, so allow more sends per IP than the
      // production default (10/min); the per-phone throttles still apply.
      env: { PORT: String(API_PORT), APP_URL: WEB_URL, OTP_SENDS_PER_IP_PER_MINUTE: "100" },
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command: `pnpm exec next build && pnpm exec next start --port ${WEB_PORT}`,
      url: WEB_URL,
      env: { API_INTERNAL_URL: API_URL, NEXT_PUBLIC_APP_URL: WEB_URL },
      reuseExistingServer: !isCI,
      timeout: 600_000,
    },
  ],
});
