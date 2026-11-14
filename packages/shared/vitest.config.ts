import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Acceptance for M0-T5: ≥95% coverage on the money + GST engine, enforced on every run.
    coverage: {
      provider: "v8",
      include: ["src/gst.ts", "src/money.ts"],
      reporter: ["text-summary", "text"],
      thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
    },
  },
});
