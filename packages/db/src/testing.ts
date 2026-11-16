// Test-database helpers for integration tests (`@restoos/db/testing`). Never import from app code.
// Each package gets its OWN test database (suffix), because turbo runs packages' tests in parallel
// and every suite truncates all tables between tests — sharing one database made them block
// each other (M1-T1). `packages/db` uses `restoos_test`, `apps/api` uses `restoos_test_api`.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { loadRootEnv } from "@restoos/shared/env/node";
import pg from "pg";
import { createPrismaClient, type PrismaClient } from "./index";

/**
 * Returns the test database URL (TEST_DATABASE_URL, plus `_<suffix>` on the database name) after
 * safety checks: it must be set, must not equal DATABASE_URL, and its name must contain "test" —
 * so tests can never truncate the dev database.
 */
export function testDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
  suffix?: string,
): string {
  const base = env.TEST_DATABASE_URL;
  if (!base) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  if (base === env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must point at a different database than DATABASE_URL");
  }
  const url = new URL(base);
  const baseName = url.pathname.replace(/^\//, "");
  if (!baseName.includes("test")) {
    throw new Error(`TEST_DATABASE_URL database name must contain "test" (got "${baseName}")`);
  }
  if (suffix) {
    if (!/^[a-z0-9_]+$/.test(suffix)) throw new Error(`invalid test database suffix "${suffix}"`);
    url.pathname = `/${baseName}_${suffix}`;
  }
  return url.toString();
}

export function createTestDb(suffix?: string): PrismaClient {
  loadRootEnv();
  return createPrismaClient(testDatabaseUrl(process.env, suffix));
}

/** Empties every table (except Prisma's migration history) — call in beforeEach. */
export async function resetTestDb(db: PrismaClient): Promise<void> {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  // Identifiers come from the Postgres catalog, not user input.
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

/**
 * Vitest's source-map stack printer crashes on errors thrown from globalSetup and swallows the
 * message, so pre-fill a plain stack: the reader sees exactly this text.
 */
function setupError(message: string): Error {
  const err = new Error(message);
  err.stack = `Error: ${message}`;
  return err;
}

/**
 * For a package's Vitest globalSetup: creates the test database if missing and applies
 * migrations with `prisma migrate deploy` (never drops data).
 */
export async function prepareTestDatabase(suffix?: string): Promise<void> {
  loadRootEnv();
  let url: string;
  try {
    url = testDatabaseUrl(process.env, suffix);
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
    cwd: join(import.meta.dirname, ".."), // packages/db (prisma.config.ts lives here)
    env: { ...process.env, DATABASE_URL: url },
    encoding: "utf8",
  });
  if (res.status !== 0) {
    throw setupError(`prisma migrate deploy failed on ${dbName}:\n${res.stdout}${res.stderr}`);
  }
}
