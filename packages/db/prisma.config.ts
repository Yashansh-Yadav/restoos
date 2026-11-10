import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer auto-loads .env; use Node's built-in loader for the monorepo root .env.
const rootEnv = resolve(import.meta.dirname, "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed/seed.ts",
  },
  // `prisma generate` / `validate` don't need a database, so don't fail when it's unset.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
