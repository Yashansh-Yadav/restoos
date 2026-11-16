import type * as Sentry from "@sentry/nextjs";

// Shared Sentry options for the browser and the Next server (M0-T6): errors only, no tracing,
// and no personal data — never user info, cookies, headers, bodies or query strings (rule 9).
export function sentryOptions(dsn: string): Sentry.BrowserOptions & Sentry.NodeOptions {
  return {
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
  };
}
