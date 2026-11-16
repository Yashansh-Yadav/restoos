import { Writable } from "node:stream";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { buildApp, type App } from "./app";
import { loggerOptions, REDACTED } from "./lib/logger";
import { initErrorReporting, reportError } from "./lib/observability";

type LogLine = Record<string, unknown>;

/** Builds the app with the real logger config, writing JSON lines into memory. */
async function appWithLogs(onServerError = vi.fn()) {
  const lines: LogLine[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, done) {
      for (const l of chunk.toString().split("\n").filter(Boolean))
        lines.push(JSON.parse(l) as LogLine);
      done();
    },
  });
  const app = await buildApp({
    docs: false,
    logger: { ...loggerOptions({ LOG_LEVEL: "info", NODE_ENV: "test" }), stream },
    onServerError,
  });
  const routes: FastifyPluginAsyncZod = async (a) => {
    a.post("/echo", { schema: { body: z.object({ qty: z.number().int() }) } }, (req) => {
      req.log.info({ pin: "1234", nested: { otp: "999999" } }, "handled");
      return req.body;
    });
    a.get("/boom", () => {
      throw new Error("database exploded");
    });
  };
  await app.register(routes, { prefix: "/test" });
  return { app, lines, onServerError };
}

describe("request ids and structured logs", () => {
  let app: App | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("puts a request id on every request log line and in the response header", async () => {
    const ctx = await appWithLogs();
    app = ctx.app;
    const res = await app.inject({ method: "GET", url: "/api/health" });
    const id = res.headers["x-request-id"];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const requestLines = ctx.lines.filter((l) => "req" in l || "res" in l);
    expect(requestLines.length).toBeGreaterThanOrEqual(2);
    for (const l of requestLines) expect(l.requestId).toBe(id);
    expect(ctx.lines[0]).toMatchObject({ service: "api", env: "test" });
  });

  it("reuses a well-formed incoming x-request-id and replaces a malformed one", async () => {
    app = (await appWithLogs()).app;
    const ok = await app.inject({
      url: "/api/health",
      headers: { "x-request-id": "edge-abc12345" },
    });
    expect(ok.headers["x-request-id"]).toBe("edge-abc12345");
    const bad = await app.inject({
      url: "/api/health",
      headers: { "x-request-id": "bad id<script>" },
    });
    expect(bad.headers["x-request-id"]).not.toBe("bad id<script>");
  });

  it("redacts auth headers, cookies, PINs and OTPs from logs", async () => {
    const ctx = await appWithLogs();
    app = ctx.app;
    await app.inject({
      method: "POST",
      url: "/test/echo",
      payload: { qty: 1 },
      headers: { authorization: "Bearer secret-token", cookie: "session=abc" },
    });
    const all = JSON.stringify(ctx.lines);
    expect(all).not.toContain("secret-token");
    expect(all).not.toContain("session=abc");

    const handled = ctx.lines.find((l) => l.msg === "handled");
    expect(handled).toMatchObject({ pin: REDACTED, nested: { otp: REDACTED } });

    const incoming = ctx.lines.find((l) => l.msg === "incoming request") as
      { req?: { headers?: Record<string, string> } } | undefined;
    // Fastify's default req serializer omits headers; if a future serializer adds them, they're redacted.
    for (const h of ["authorization", "cookie"]) {
      const value = incoming?.req?.headers?.[h];
      if (value !== undefined) expect(value).toBe(REDACTED);
    }
  });
});

describe("error reporting", () => {
  let app: App | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("reports a 5xx once, with the request id, and never leaks the message", async () => {
    const ctx = await appWithLogs();
    app = ctx.app;
    const res = await app.inject({ url: "/test/boom" });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("database exploded");
    expect(ctx.onServerError).toHaveBeenCalledTimes(1);
    const [err, req] = ctx.onServerError.mock.calls[0] as [Error, { id: string }];
    expect(err.message).toBe("database exploded");
    expect(req.id).toBe(res.headers["x-request-id"]);
    const errorLine = ctx.lines.find((l) => l.level === 50);
    expect(errorLine?.requestId).toBe(res.headers["x-request-id"]);
  });

  it("does not report expected client errors (400, 404)", async () => {
    const ctx = await appWithLogs();
    app = ctx.app;
    await app.inject({ method: "POST", url: "/test/echo", payload: { qty: "x" } });
    await app.inject({ url: "/api/nope" });
    expect(ctx.onServerError).not.toHaveBeenCalled();
  });

  it("is a safe no-op without a Sentry DSN", async () => {
    expect(await initErrorReporting({ NODE_ENV: "test" })).toBe(false);
    expect(() => reportError(new Error("x"), { requestId: "r1" })).not.toThrow();
  });
});
