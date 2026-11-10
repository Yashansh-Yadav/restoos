import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

// Acceptance for M0-T3: the API refuses to start with a clear message when env is missing.
describe("server fail-fast", () => {
  // Spawning a TypeScript process can be slow while turbo runs other tasks in parallel.
  it("exits with code 1 and names the missing variables", { timeout: 60_000 }, () => {
    const require = createRequire(import.meta.url);
    const tsxCli = join(dirname(require.resolve("tsx/package.json")), "dist", "cli.mjs");
    const env: NodeJS.ProcessEnv = { ...process.env, RESTOOS_SKIP_DOTENV: "1" };
    delete env.DATABASE_URL;
    delete env.REDIS_URL;
    delete env.APP_URL;

    const res = spawnSync(process.execPath, [tsxCli, "src/server.ts"], {
      cwd: join(import.meta.dirname, ".."),
      env,
      encoding: "utf8",
      timeout: 55_000,
    });

    const output = `status=${String(res.status)} signal=${String(res.signal)} error=${String(res.error)}\n${res.stderr}${res.stdout}`;
    expect(res.status, output).toBe(1);
    expect(res.stderr).toContain("Invalid environment for @restoos/api");
    expect(res.stderr).toContain("DATABASE_URL: required");
    expect(res.stderr).toContain("REDIS_URL: required");
    expect(res.stderr).not.toContain("    at "); // a clear list, not a stack trace
  });
});
