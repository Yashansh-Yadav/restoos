import { defineConfig } from "vitest/config";

// The first test in a run boots Fastify cold (~2s alone). Under `pnpm check`, turbo runs
// typecheck/coverage/property tests in parallel and that boot was measured at up to ~24s,
// so allow 60s. Genuine hangs still fail.
const timeouts = { testTimeout: 60_000, hookTimeout: 60_000 };

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.int.test.ts"],
          ...timeouts,
        },
      },
      {
        // Against the restoos_test DB (created + migrated by the shared global setup) and Redis.
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.int.test.ts"],
          globalSetup: ["./test/global-setup.ts"],
          fileParallelism: false,
          ...timeouts,
        },
      },
    ],
  },
});
