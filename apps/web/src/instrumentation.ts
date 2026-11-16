// Next.js server instrumentation (M0-T6). Error tracking is off unless NEXT_PUBLIC_SENTRY_DSN
// is set; @sentry/nextjs is only loaded then. No edge routes exist, so only Node.js is set up.

import type * as SentryNext from "@sentry/nextjs";

type CaptureRequestError = typeof SentryNext.captureRequestError;

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

export async function register(): Promise<void> {
  if (!dsn || process.env.NEXT_RUNTIME !== "nodejs") return;
  const [Sentry, { sentryOptions }] = await Promise.all([
    import("@sentry/nextjs"),
    import("@/lib/sentry"),
  ]);
  Sentry.init(sentryOptions(dsn));
}

/** Reports errors thrown while rendering Server Components / handling requests. */
export async function onRequestError(...args: Parameters<CaptureRequestError>): Promise<void> {
  if (!dsn) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
}
