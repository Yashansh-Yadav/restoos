import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MODEL_SCOPE, type ModelScope } from "./tenancy";

// The tenant extension trusts MODEL_SCOPE, so it must match the real columns in schema.prisma.

const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map(([, name, body]) => ({
  name: name ?? "",
  body: body ?? "",
}));

function expectedScope(name: string, body: string): ModelScope | "auth-or-global" {
  if (name === "Organization") return "organization-root";
  const org = /^\s+organizationId\s+String\s/m.test(body);
  const outlet = body.match(/^\s+outletId\s+String(\?)?\s/m);
  if (!org) return "auth-or-global";
  if (!outlet) return "organization";
  return outlet[1] ? "outlet-optional" : "outlet";
}

describe("MODEL_SCOPE", () => {
  it("classifies exactly the models in schema.prisma", () => {
    expect(Object.keys(MODEL_SCOPE).sort()).toEqual(models.map((m) => m.name).sort());
  });

  it.each(models)("$name matches its tenant columns", ({ name, body }) => {
    const actual = MODEL_SCOPE[name as keyof typeof MODEL_SCOPE];
    const expected = expectedScope(name, body);
    if (expected === "auth-or-global") expect(["auth", "global"]).toContain(actual);
    else expect(actual).toBe(expected);
  });
});
