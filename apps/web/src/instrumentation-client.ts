import { sentryOptions } from "@/lib/sentry";

// Browser error tracking (M0-T6). Off unless NEXT_PUBLIC_SENTRY_DSN is set at build time.
// Loaded lazily so customers' phones don't download the SDK when tracking is off (menu LCP).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  void import("@sentry/nextjs").then((Sentry) => Sentry.init(sentryOptions(dsn)));
}
