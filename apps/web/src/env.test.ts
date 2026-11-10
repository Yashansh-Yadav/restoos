import { EnvError } from "@restoos/shared/env";
import { describe, expect, it } from "vitest";
import { loadWebServerEnv } from "./env";

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
