import "server-only";
import {
  authConfigSchema,
  meResponseSchema,
  type AuthConfig,
  type MeResponse,
} from "@restoos/shared";
import { apiFetch } from "@/lib/api";
import { apiFetchAsUser } from "@/lib/api-server";

/** The signed-in owner, or null when not signed in (Server Components only). */
export function getMe(): Promise<MeResponse | null> {
  return apiFetchAsUser("/api/me", meResponseSchema);
}

/** Which sign-in methods to show; Google is hidden until it's configured on the API. */
export async function getAuthConfig(): Promise<AuthConfig> {
  try {
    return await apiFetch("/api/auth-config", authConfigSchema, { cache: "no-store" });
  } catch {
    return { google: false, phone: true };
  }
}
