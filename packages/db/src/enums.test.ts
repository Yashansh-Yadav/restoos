import { enumSchemas } from "@restoos/shared";
import { describe, expect, it } from "vitest";
import * as prismaEnums from "./generated/prisma/enums";

// The web app validates with the zod enums in @restoos/shared and never imports Prisma.
// If schema.prisma changes an enum, this test fails until enums.ts is updated to match.
describe("shared zod enums mirror the Prisma enums", () => {
  const prisma = prismaEnums as unknown as Record<string, Record<string, string>>;

  it("covers every Prisma enum and nothing else", () => {
    expect(Object.keys(enumSchemas).sort()).toEqual(Object.keys(prisma).sort());
  });

  it.each(Object.entries(enumSchemas))("%s has the same values", (name, schema) => {
    expect([...schema.options].sort()).toEqual(Object.values(prisma[name] ?? {}).sort());
  });
});
