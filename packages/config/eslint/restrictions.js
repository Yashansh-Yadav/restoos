// Import restrictions that enforce the architecture (CLAUDE.md rules 2 and 3, plan §5.3 / M1-T3).
// Shared by the eslint configs and by apps/api/src/lint-rules.test.ts, so the rules can't rot.
// Core `no-restricted-imports` also reports `import type`, so the raw client can't sneak in as a
// type either.

import tseslint from "typescript-eslint";

/** TypeScript parser, re-exported so tests can lint snippets without their own dependency. */
export const tsParser = tseslint.parser;

const TENANT_MESSAGE =
  "Feature modules must not use the raw Prisma client — use getTenantDb(ctx) (apps/api/src/lib/tenant.ts) or a bound lib/ service. CLAUDE.md rule 3.";

/** apps/api/src/modules/** (non-test files): no raw Prisma client. Enums and model types are fine. */
export const apiModuleImportRule = [
  "error",
  {
    paths: [
      {
        name: "@restoos/db",
        importNames: ["PrismaClient", "createPrismaClient"],
        message: TENANT_MESSAGE,
      },
      { name: "@restoos/db/testing", message: TENANT_MESSAGE },
    ],
    patterns: [
      {
        group: ["@prisma/*", "**/generated/prisma", "**/generated/prisma/**"],
        message: TENANT_MESSAGE,
      },
    ],
  },
];

const WEB_MESSAGE =
  "apps/web is frontend only: no database, Redis or server auth adapters — call the API via apiFetch(). CLAUDE.md rule 2.";

/** apps/web: nothing server-side at all. */
export const webImportRule = [
  "error",
  {
    paths: [
      { name: "@restoos/db", message: WEB_MESSAGE },
      { name: "pg", message: WEB_MESSAGE },
      { name: "ioredis", message: WEB_MESSAGE },
    ],
    patterns: [
      {
        group: ["@restoos/db/*", "@prisma/*", "better-auth/adapters/*", "@better-auth/*-adapter"],
        message: WEB_MESSAGE,
      },
    ],
  },
];
