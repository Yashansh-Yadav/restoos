// M1-T3: the isolation lint rules actually fire (and don't block what's allowed).
import { apiModuleImportRule, tsParser, webImportRule } from "@restoos/config/eslint/restrictions";
import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

const linter = new Linter({ configType: "flat" });
const lint = (rule: Linter.RuleEntry, code: string) =>
  linter
    .verify(
      code,
      [
        {
          files: ["**/*.ts"],
          languageOptions: { parser: tsParser },
          rules: { "no-restricted-imports": rule },
        },
      ],
      "file.ts",
    )
    .map((m) => m.message);

describe("apps/api modules: no raw Prisma client (rule 3)", () => {
  it.each([
    `import { PrismaClient } from "@restoos/db";`,
    `import type { PrismaClient } from "@restoos/db";`,
    `import { createPrismaClient } from "@restoos/db";`,
    `import { createTestDb } from "@restoos/db/testing";`,
    `import { PrismaPg } from "@prisma/adapter-pg";`,
    `import { PrismaClient } from "../../../../packages/db/src/generated/prisma/client";`,
  ])("rejects %s", (code) => {
    expect(lint(apiModuleImportRule, code).join()).toContain("getTenantDb(ctx)");
  });

  it("allows enums and model types", () => {
    expect(
      lint(apiModuleImportRule, `import { Role, type MenuItem, Prisma } from "@restoos/db";`),
    ).toEqual([]);
  });
});

describe("apps/web: frontend only (rule 2)", () => {
  it.each([
    `import { Role } from "@restoos/db";`,
    `import { createTestDb } from "@restoos/db/testing";`,
    `import { PrismaClient } from "@prisma/client";`,
    `import Redis from "ioredis";`,
    `import { Pool } from "pg";`,
  ])("rejects %s", (code) => {
    expect(lint(webImportRule, code).join()).toContain("frontend only");
  });

  it("allows shared schemas", () => {
    expect(lint(webImportRule, `import { meResponseSchema } from "@restoos/shared";`)).toEqual([]);
  });
});
