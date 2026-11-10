import { defineConfig } from "vitest/config";

// Two projects: fast unit tests (parallel) and integration tests against the test database
// (serial — they share one database). `pnpm infra:up` must be running for integration tests.
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "prisma/**/*.test.ts"],
          exclude: ["**/*.int.test.ts", "**/node_modules/**", "src/generated/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.int.test.ts"],
          globalSetup: ["./test/global-setup.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
