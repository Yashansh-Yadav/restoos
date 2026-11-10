// Test-database helpers for integration tests (`@restoos/db/testing`). Never import from app code.
import { createPrismaClient, type PrismaClient } from "./index";

/**
 * Returns TEST_DATABASE_URL after safety checks: it must be set, must not equal DATABASE_URL,
 * and its database name must contain "test" — so tests can never truncate the dev database.
 */
export function testDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  const url = env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  if (url === env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must point at a different database than DATABASE_URL");
  }
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!dbName.includes("test")) {
    throw new Error(`TEST_DATABASE_URL database name must contain "test" (got "${dbName}")`);
  }
  return url;
}

export function createTestDb(): PrismaClient {
  return createPrismaClient(testDatabaseUrl());
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
