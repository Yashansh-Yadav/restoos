import { parseEnv } from "@restoos/shared/env";
import { z } from "zod";

// apps/web is frontend only (CLAUDE.md rule 2): it holds no secrets, just where to find the API
// and public settings. Validated at startup by next.config.ts, so a bad value fails `next dev`/`build`.

const DEV_API_URL = "http://localhost:4000";

export const webServerEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    // Where server-side code (Server Components, the /api rewrite) reaches apps/api.
    API_INTERNAL_URL: z.url().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && !env.API_INTERNAL_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["API_INTERNAL_URL"],
        message: "required in production (no localhost fallback)",
      });
    }
  })
  .transform((env) => ({ ...env, API_INTERNAL_URL: env.API_INTERNAL_URL ?? DEV_API_URL }));

export type WebServerEnv = z.infer<typeof webServerEnvSchema>;

/** Server-only settings. Never call from a client component. */
export function loadWebServerEnv(
  source: Record<string, string | undefined> = process.env,
): WebServerEnv {
  return parseEnv("@restoos/web (server)", webServerEnvSchema, source);
}

export const webClientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().optional(),
});

/**
 * Public settings inlined into the browser bundle. Each NEXT_PUBLIC_* var must be referenced
 * explicitly here so Next.js can inline it.
 */
export function loadWebClientEnv() {
  return parseEnv("@restoos/web (client)", webClientEnvSchema, {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
}
