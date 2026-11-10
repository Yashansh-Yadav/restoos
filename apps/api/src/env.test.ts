import { EnvError } from "@restoos/shared/env";
import { describe, expect, it } from "vitest";
import { loadApiEnv } from "./env";

const valid = {
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://restoos:restoos@localhost:5434/restoos",
  REDIS_URL: "redis://localhost:6380",
};

function problemsFor(source: Record<string, string | undefined>): readonly string[] {
  try {
    loadApiEnv(source);
  } catch (e) {
    if (e instanceof EnvError) return e.problems;
    throw e;
  }
  return [];
}

describe("api env", () => {
  it("accepts a minimal local env and fills defaults", () => {
    const env = loadApiEnv(valid);
    expect(env).toMatchObject({
      NODE_ENV: "development",
      HOST: "0.0.0.0",
      PORT: 4000,
      LOG_LEVEL: "info",
      OTP_PROVIDER: "console",
      S3_REGION: "ap-south-1",
    });
  });

  it("requires DATABASE_URL, REDIS_URL and APP_URL", () => {
    const problems = problemsFor({});
    expect(problems).toEqual(
      expect.arrayContaining([
        "DATABASE_URL: required",
        "REDIS_URL: required",
        "APP_URL: required",
      ]),
    );
  });

  it("rejects a non-postgres DATABASE_URL and a non-redis REDIS_URL", () => {
    const problems = problemsFor({
      ...valid,
      DATABASE_URL: "mysql://localhost/db",
      REDIS_URL: "http://localhost:6380",
    });
    expect(problems.some((p) => p.startsWith("DATABASE_URL:"))).toBe(true);
    expect(problems.some((p) => p.startsWith("REDIS_URL:"))).toBe(true);
  });

  it("leaves integration secrets optional but checks their format when set", () => {
    expect(problemsFor(valid)).toEqual([]);
    const problems = problemsFor({
      ...valid,
      BETTER_AUTH_SECRET: "too-short",
      PLATFORM_GSTIN: "NOT-A-GSTIN",
      VAPID_SUBJECT: "admin@example.com",
      SENTRY_DSN: "nope",
    });
    expect(problems.map((p) => p.split(":")[0]).sort()).toEqual([
      "BETTER_AUTH_SECRET",
      "PLATFORM_GSTIN",
      "SENTRY_DSN",
      "VAPID_SUBJECT",
    ]);
  });

  it("rejects an out-of-range PORT", () => {
    expect(problemsFor({ ...valid, PORT: "70000" })[0]).toMatch(/^PORT:/);
  });
});
