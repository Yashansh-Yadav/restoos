import { EnvError } from "@restoos/shared/env";
import { describe, expect, it } from "vitest";
import { DEV_AUTH_SECRET, loadApiEnv } from "./env";

const valid = {
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://restoos:restoos@localhost:5434/restoos",
  REDIS_URL: "redis://localhost:6380",
  BETTER_AUTH_SECRET: DEV_AUTH_SECRET,
};

const production = {
  ...valid,
  NODE_ENV: "production",
  APP_URL: "https://app.restoos.in",
  BETTER_AUTH_SECRET: "x".repeat(48),
  GOOGLE_CLIENT_ID: "id.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "secret",
  OTP_PROVIDER: "msg91",
  OTP_API_KEY: "key",
};

describe("api env — auth rules (M1-T1)", () => {
  it("requires BETTER_AUTH_SECRET everywhere", () => {
    expect(problemsFor({ ...valid, BETTER_AUTH_SECRET: undefined })).toEqual([
      "BETTER_AUTH_SECRET: required",
    ]);
  });

  it("accepts a correct production config", () => {
    expect(problemsFor(production)).toEqual([]);
  });

  it("rejects development shortcuts in production", () => {
    const problems = problemsFor({
      ...production,
      BETTER_AUTH_SECRET: DEV_AUTH_SECRET,
      OTP_PROVIDER: "console",
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: undefined,
      APP_URL: "http://app.restoos.in",
    });
    expect(problems.map((p) => p.split(":")[0]).sort()).toEqual([
      "APP_URL",
      "BETTER_AUTH_SECRET",
      "GOOGLE_CLIENT_ID",
      "OTP_PROVIDER",
    ]);
  });

  it("requires the Google id and secret together, and an API key for real OTP providers", () => {
    expect(problemsFor({ ...valid, GOOGLE_CLIENT_ID: "only-id" })[0]).toMatch(
      /^GOOGLE_CLIENT_SECRET:/,
    );
    expect(problemsFor({ ...valid, OTP_PROVIDER: "msg91" })[0]).toMatch(/^OTP_API_KEY:/);
  });
});

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

  it("validates the optional Sentry settings", () => {
    expect(
      problemsFor({
        ...valid,
        SENTRY_DSN: "https://k@o1.ingest.sentry.io/1",
        SENTRY_ENVIRONMENT: "staging",
        SENTRY_RELEASE: "abc123",
      }),
    ).toEqual([]);
    expect(problemsFor({ ...valid, SENTRY_ENVIRONMENT: "Prod Env!" })[0]).toMatch(
      /^SENTRY_ENVIRONMENT:/,
    );
  });

  it("rejects an out-of-range PORT", () => {
    expect(problemsFor({ ...valid, PORT: "70000" })[0]).toMatch(/^PORT:/);
  });
});
