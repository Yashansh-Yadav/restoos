import "server-only";
import { cookies } from "next/headers";
import type { z } from "zod";
import { ApiError, apiFetch } from "./api";

/**
 * Server Components: call the API as the signed-in user by forwarding their cookies.
 * Returns null on 401 so pages can redirect to /login.
 */
export async function apiFetchAsUser<S extends z.ZodType>(
  path: `/api/${string}`,
  schema: S,
): Promise<z.infer<S> | null> {
  const cookieHeader = (await cookies()).toString();
  try {
    return await apiFetch(path, schema, {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}
