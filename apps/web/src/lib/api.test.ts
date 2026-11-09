import { healthResponseSchema } from "@restoos/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "./api";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the API and returns the parsed body", async () => {
    const fn = mockFetch(200, { ok: true });
    await expect(apiFetch("/api/health", healthResponseSchema)).resolves.toEqual({ ok: true });
    expect(fn).toHaveBeenCalledWith("http://localhost:4000/api/health", expect.any(Object));
  });

  it("throws ApiError with the API's code and message", async () => {
    mockFetch(404, { error: { code: "NOT_FOUND", message: "Route GET /api/x not found" } });
    const err = await apiFetch("/api/x", healthResponseSchema).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("throws a generic ApiError when the error body is not in the shared shape", async () => {
    mockFetch(502, "Bad Gateway");
    await expect(apiFetch("/api/health", healthResponseSchema)).rejects.toMatchObject({
      status: 502,
      code: "HTTP_ERROR",
    });
  });

  it("rejects a response that does not match the schema", async () => {
    mockFetch(200, { ok: "yes" });
    await expect(apiFetch("/api/health", healthResponseSchema)).rejects.toThrow();
  });
});
