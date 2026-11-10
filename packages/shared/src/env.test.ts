import { describe, expect, it } from "vitest";
import { z } from "zod";
import { EnvError, parseEnv } from "./env";
import { findRepoRoot } from "./env-node";

const schema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(4000),
  API_KEY: z.string().min(10).optional(),
});

function errorOf(fn: () => unknown): EnvError {
  try {
    fn();
  } catch (e) {
    if (e instanceof EnvError) return e;
    throw e;
  }
  throw new Error("expected an EnvError");
}

describe("parseEnv", () => {
  it("returns typed values with coercion and defaults", () => {
    expect(parseEnv("app", schema, { DATABASE_URL: "postgresql://x@localhost/db" })).toEqual({
      DATABASE_URL: "postgresql://x@localhost/db",
      PORT: 4000,
    });
    expect(parseEnv("app", schema, { DATABASE_URL: "postgresql://h/db", PORT: "5000" }).PORT).toBe(
      5000,
    );
  });

  it("lists every problem in one error and names the app", () => {
    const err = errorOf(() => parseEnv("@restoos/api", schema, { PORT: "abc", API_KEY: "short" }));
    expect(err.message).toContain("@restoos/api");
    expect(err.problems).toHaveLength(3);
    expect(err.message).toMatch(/DATABASE_URL: required/);
    expect(err.message).toMatch(/PORT: /);
    expect(err.message).toMatch(/API_KEY: /);
  });

  it("treats empty strings as unset", () => {
    const err = errorOf(() => parseEnv("app", schema, { DATABASE_URL: "  ", API_KEY: "" }));
    expect(err.problems).toEqual(["DATABASE_URL: required"]);
  });

  it("never includes the offending values in the message", () => {
    const secret = "sk_live_supersecret";
    const err = errorOf(() => parseEnv("app", schema, { DATABASE_URL: secret, API_KEY: "short" }));
    expect(err.message).not.toContain(secret);
    expect(err.message).not.toContain("short");
  });
});

describe("findRepoRoot", () => {
  it("finds the folder that holds pnpm-workspace.yaml", () => {
    const root = findRepoRoot(import.meta.dirname);
    expect(root).toBeDefined();
    expect(import.meta.dirname.startsWith(root ?? "-")).toBe(true);
  });
});
