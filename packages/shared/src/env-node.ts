import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

// Node-only helpers (`@restoos/shared/env/node`). Never import from browser code.

/** Finds the monorepo root (the folder holding pnpm-workspace.yaml), starting from `from`. */
export function findRepoRoot(from: string = process.cwd()): string | undefined {
  let dir = from;
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Loads the repo-root `.env` into process.env when the file exists, using Node's built-in loader
 * (no dotenv). Variables already set in the environment win. Deployed servers have no .env file,
 * so they rely on real environment variables. RESTOOS_SKIP_DOTENV=1 disables loading (tests).
 */
export function loadRootEnv(from?: string): void {
  if (process.env.RESTOOS_SKIP_DOTENV === "1") return;
  const root = findRepoRoot(from);
  const file = root && join(root, ".env");
  if (file && existsSync(file)) process.loadEnvFile(file);
}
