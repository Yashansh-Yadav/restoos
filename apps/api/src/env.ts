import { EnvError, parseEnv } from "@restoos/shared/env";
import { loadRootEnv } from "@restoos/shared/env/node";
import { z } from "zod";

// Every variable apps/api reads (plan §13). Required = used by code today. Integration secrets
// are optional (format-checked when set) and become required in the milestone that uses them.

const url = z.url();
const optional = <T extends z.ZodType>(schema: T) => schema.optional();

export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  APP_URL: url,

  DATABASE_URL: z
    .url()
    .refine((v) => /^postgres(ql)?:\/\//.test(v), "must be a postgres:// or postgresql:// URL"),
  REDIS_URL: z.url().refine((v) => /^rediss?:\/\//.test(v), "must be a redis:// or rediss:// URL"),

  // Owner auth (M1-T1): Better Auth + Google OAuth 2.0 + phone OTP
  BETTER_AUTH_SECRET: optional(z.string().min(32, "must be at least 32 characters")),
  GOOGLE_CLIENT_ID: optional(z.string()),
  GOOGLE_CLIENT_SECRET: optional(z.string()),
  OTP_PROVIDER: z.enum(["console", "msg91"]).default("console"),
  OTP_API_KEY: optional(z.string()),

  // Web Push (M8-T1)
  VAPID_PUBLIC_KEY: optional(z.string()),
  VAPID_PRIVATE_KEY: optional(z.string()),
  VAPID_SUBJECT: optional(
    z.string().regex(/^(mailto:|https:\/\/)/, "must start with mailto: or https://"),
  ),

  // File storage (M2-T1)
  S3_BUCKET: optional(z.string()),
  S3_REGION: z.string().default("ap-south-1"),
  S3_ACCESS_KEY_ID: optional(z.string()),
  S3_SECRET_ACCESS_KEY: optional(z.string()),

  // Payments (M7-T4, M12)
  RAZORPAY_KEY_ID: optional(z.string()),
  RAZORPAY_KEY_SECRET: optional(z.string()),
  RAZORPAY_WEBHOOK_SECRET: optional(z.string()),

  // WhatsApp (M7-T7)
  MESSAGING_PROVIDER: z.enum(["console"]).default("console"),
  MESSAGING_API_KEY: optional(z.string()),

  // Observability (M0-T6)
  SENTRY_DSN: optional(url),

  // Our own GST invoices (M12-T9)
  PLATFORM_GSTIN: optional(
    z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "must be a valid GSTIN"),
  ),
  PLATFORM_LEGAL_NAME: optional(z.string()),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** Loads the repo-root .env (dev only) and validates. Throws EnvError listing every problem. */
export function loadApiEnv(source?: Record<string, string | undefined>): ApiEnv {
  if (!source) loadRootEnv();
  return parseEnv("@restoos/api", apiEnvSchema, source ?? process.env);
}

/** For entry points: print the problems and exit instead of a stack trace. */
export function loadApiEnvOrExit(): ApiEnv {
  try {
    return loadApiEnv();
  } catch (err) {
    if (err instanceof EnvError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}
