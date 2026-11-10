// @restoos/db — Prisma schema, client and seed. Used by apps/api only (CLAUDE.md rule 2).
// Feature code must not use the raw client: go through getTenantDb(ctx) in
// apps/api/src/lib/tenant.ts (M1-T3).
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export { Prisma, PrismaClient } from "./generated/prisma/client";
export * from "./generated/prisma/enums";
export type * from "./generated/prisma/models";

/** Creates a Prisma client backed by the Postgres driver adapter (required in Prisma 7). */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}
