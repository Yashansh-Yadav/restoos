import { EnvError, parseEnv } from "@restoos/shared/env";
import { describe, expect, it } from "vitest";
import { loadWebServerEnv, webClientEnvSchema } from "./env";

describe("web client env", () => {
  it("accepts an optional Sentry DSN and rejects a malformed one", () => {
    expect(parseEnv("web", webClientEnvSchema, {})).toEqual({});
    expect(
      parseEnv("web", webClientEnvSchema, {
        NEXT_PUBLIC_SENTRY_DSN: "https://k@o1.ingest.sentry.io/1",
      }).NEXT_PUBLIC_SENTRY_DSN,
    ).toBe("https://k@o1.ingest.sentry.io/1");
    expect(() => parseEnv("web", webClientEnvSchema, { NEXT_PUBLIC_SENTRY_DSN: "nope" })).toThrow(
      /NEXT_PUBLIC_SENTRY_DSN/,
    );
  });
});

describe("web server env", () => {
  it("falls back to the local API in development", () => {
    expect(loadWebServerEnv({ NODE_ENV: "development" }).API_INTERNAL_URL).toBe(
      "http://localhost:4000",
    );
  });

  it("requires API_INTERNAL_URL in production", () => {
    expect(() => loadWebServerEnv({ NODE_ENV: "production" })).toThrow(EnvError);
    expect(() => loadWebServerEnv({ NODE_ENV: "production" })).toThrow(
      /API_INTERNAL_URL: required in production/,
    );
  });

  it("uses the configured URL and rejects malformed ones", () => {
    expect(
      loadWebServerEnv({ NODE_ENV: "production", API_INTERNAL_URL: "http://api:4000" })
        .API_INTERNAL_URL,
    ).toBe("http://api:4000");
    expect(() => loadWebServerEnv({ API_INTERNAL_URL: "not-a-url" })).toThrow(/API_INTERNAL_URL/);
  });
});
