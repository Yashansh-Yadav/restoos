import { apiErrorSchema } from "@restoos/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { buildApp, type App } from "./app";

describe("api app", () => {
  let app: App | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("GET /api/health returns ok", async () => {
    app = await buildApp({ docs: false });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("unknown routes return the 404 error shape", async () => {
    app = await buildApp({ docs: false });
    const res = await app.inject({ method: "GET", url: "/api/nope" });
    expect(res.statusCode).toBe(404);
    const body = apiErrorSchema.parse(res.json());
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("invalid input returns 400 VALIDATION_ERROR with issues", async () => {
    app = await buildApp({ docs: false });
    const echo: FastifyPluginAsyncZod = async (a) => {
      a.post(
        "/echo",
        { schema: { body: z.object({ qty: z.number().int().positive() }) } },
        (req) => req.body,
      );
    };
    await app.register(echo, { prefix: "/test" });

    const res = await app.inject({ method: "POST", url: "/test/echo", payload: { qty: -1 } });
    expect(res.statusCode).toBe(400);
    const body = apiErrorSchema.parse(res.json());
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toBeInstanceOf(Array);
  });

  it("unexpected errors return 500 without leaking the message", async () => {
    app = await buildApp({ docs: false });
    app.get("/test/boom", () => {
      throw new Error("secret database detail");
    });

    const res = await app.inject({ method: "GET", url: "/test/boom" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
  });

  it("serves OpenAPI docs when enabled", async () => {
    app = await buildApp({ docs: true });
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/api/docs/json" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ paths: { "/api/health": {} } });
  });
});
