"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import "./globals.css";

// Last-resort screen when the root layout itself crashes (M0-T6). Reports to Sentry (if
// configured) and offers a retry. English for now — moves to the i18n helper when it lands.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Only load the SDK when tracking is configured (see instrumentation-client.ts).
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
    void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-12">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground" translate="no">
              RestoOS
            </p>
            <h1 className="text-[28px] leading-tight font-bold text-balance">
              Something Went Wrong
            </h1>
            <p className="text-base text-pretty text-body">
              The app hit an unexpected error. Try again — if it keeps happening, reload the page.
            </p>
            {error.digest ? (
              <p className="text-sm text-muted-foreground">
                Reference: <span className="font-mono tabular-nums">{error.digest}</span>
              </p>
            ) : null}
          </div>
          <Button onClick={reset} className="self-start">
            Try Again
          </Button>
        </main>
      </body>
    </html>
  );
}
