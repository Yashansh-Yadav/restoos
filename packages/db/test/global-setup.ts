// Vitest globalSetup for integration tests: make sure the test database exists and is migrated.
// Uses `prisma migrate deploy` (applies pending migrations, never drops data).
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { loadRootEnv } from "@restoos/shared/env/node";
import pg from "pg";
import { testDatabaseUrl } from "../src/testing";

/**
 * Vitest's source-map stack printer crashes on errors thrown from globalSetup and swallows the
 * message, so pre-fill a plain stack: the reader sees exactly this text.
 */
function setupError(message: string): Error {
  const err = new Error(message);
  err.stack = `Error: ${message}`;
  return err;
}

export default async function setup(): Promise<void> {
  loadRootEnv();
  let url: string;
  try {
    url = testDatabaseUrl();
  } catch (err) {
    throw setupError(err instanceof Error ? err.message : String(err));
  }
  const target = new URL(url);
  const dbName = target.pathname.replace(/^\//, "");

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  try {
    await client.connect();
  } catch (err) {
    throw setupError(
      `Postgres not reachable at ${target.host} — run \`pnpm infra:up\` first. (${String(err)})`,
    );
  }
  try {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      dbName,
    ]);
    if (!rowCount) await client.query(`CREATE DATABASE "${dbName.replaceAll('"', "")}"`);
  } finally {
    await client.end();
  }

  const require = createRequire(import.meta.url);
  const prismaCli = join(dirname(require.resolve("prisma/package.json")), "build", "index.js");
  const res = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: join(import.meta.dirname, ".."),
    env: { ...process.env, DATABASE_URL: url },
    encoding: "utf8",
  });
  if (res.status !== 0) {
    throw setupError(
      `prisma migrate deploy failed on the test database:\n${res.stdout}${res.stderr}`,
    );
  }
}
