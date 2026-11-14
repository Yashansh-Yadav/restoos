import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The first test in a run boots Fastify cold (~2s alone). Under `pnpm check`, turbo runs
    // typecheck/coverage/property tests in parallel and that boot was measured at up to ~24s,
    // so allow 60s. Genuine hangs still fail.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
