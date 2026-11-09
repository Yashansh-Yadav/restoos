import { apiErrorSchema } from "@restoos/shared";
import type { z } from "zod";

/** An error response from apps/api, in the shared `{ error: { code, message } }` shape. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Browser: same-origin `/api/*` (Next rewrite / Caddy). Server: call the API directly.
function baseUrl(): string {
  if (typeof window !== "undefined") return "";
  return process.env.API_INTERNAL_URL ?? "http://localhost:4000";
}

/**
 * Calls the RestoOS API and parses the response with the shared zod schema.
 * Server Components must pass the user's cookies in `init.headers` (added with auth in M1-T1).
 */
export async function apiFetch<S extends z.ZodType>(
  path: `/api/${string}`,
  schema: S,
  init: RequestInit = {},
): Promise<z.infer<S>> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const res = await fetch(`${baseUrl()}${path}`, { ...init, headers });
  const data: unknown = res.status === 204 ? undefined : await res.json().catch(() => undefined);

  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(data);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiError(res.status, code, message, details);
    }
    throw new ApiError(res.status, "HTTP_ERROR", `Request failed with status ${res.status}`);
  }

  return schema.parse(data);
}
