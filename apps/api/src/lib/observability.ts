import type * as SentryNode from "@sentry/node";
import type { ApiEnv } from "../env";

// Error tracking (M0-T6). We report explicitly from our own error handler instead of Sentry's
// automatic Fastify instrumentation (that needs `node --import` and lists Fastify 3/4 only).
// @sentry/node is loaded lazily, only when SENTRY_DSN is set: it pulls in the OpenTelemetry stack
// (measured 1–4s warm, ~54s cold on Windows), which dev, tests and CI shouldn't pay for.

type ObservabilityEnv = Pick<
  ApiEnv,
  "SENTRY_DSN" | "SENTRY_ENVIRONMENT" | "SENTRY_RELEASE" | "NODE_ENV"
>;

type SentryModule = typeof SentryNode;
let sentry: SentryModule | undefined;

/** Loads and initialises Sentry when a DSN is configured. Returns whether reporting is on. */
export async function initErrorReporting(env: ObservabilityEnv): Promise<boolean> {
  if (!env.SENTRY_DSN) return false;
  const Sentry = await import("@sentry/node");
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    ...(env.SENTRY_RELEASE ? { release: env.SENTRY_RELEASE } : {}),
    tracesSampleRate: 0, // errors only (no performance tracing yet)
    // Privacy (rule 9 / DPDP): never ship user info, cookies, headers, bodies or query strings.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
  });
  sentry = Sentry;
  return true;
}

export type ErrorContext = {
  requestId?: string;
  method?: string;
  route?: string;
  [key: string]: unknown;
};

/** Sends an unexpected (5xx) error to Sentry, tagged with the request id from the logs. */
export function reportError(err: unknown, context: ErrorContext = {}): void {
  const Sentry = sentry;
  if (!Sentry) return;
  const { requestId, method, route, ...extra } = context;
  Sentry.withScope((scope) => {
    if (requestId) scope.setTag("requestId", requestId);
    if (method) scope.setTag("method", method);
    if (route) scope.setTag("route", route);
    scope.setExtras(extra);
    Sentry.captureException(err);
  });
}

/** Waits (up to `timeoutMs`) for queued events to be sent — call before process exit. */
export async function flushErrorReporting(timeoutMs = 2_000): Promise<void> {
  if (sentry) await sentry.flush(timeoutMs);
}
