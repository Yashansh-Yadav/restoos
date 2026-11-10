import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // Same "@/*" alias as tsconfig.json paths.
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // e2e/*.spec.ts are Playwright tests (`pnpm test:e2e`), not Vitest.
  test: { exclude: [...configDefaults.exclude, "e2e/**"] },
});
