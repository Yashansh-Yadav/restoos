import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Route tests boot a full Fastify app (and DB integration tests arrive in M0-T4),
    // which can exceed the 5s default when every workspace runs in parallel.
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
