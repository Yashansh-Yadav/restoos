import { buildApp } from "./app";
import { loadApiEnvOrExit } from "./env";
import { loggerOptions } from "./lib/logger";
import { flushErrorReporting, initErrorReporting, reportError } from "./lib/observability";

// Fail fast: validate every env var before anything else starts (M0-T3).
const env = loadApiEnvOrExit();
const sentryOn = await initErrorReporting(env);

const app = await buildApp({
  logger: loggerOptions(env),
  docs: env.NODE_ENV !== "production",
  onServerError: (err, req) =>
    reportError(err, { requestId: req.id, method: req.method, route: req.routeOptions.url }),
});
app.log.info(
  { sentry: sentryOn },
  "error reporting %s",
  sentryOn ? "enabled" : "disabled (no SENTRY_DSN)",
);

async function shutdown(signal: string, code = 0): Promise<void> {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  await flushErrorReporting();
  process.exit(code);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// Crashes outside a request still reach Sentry and the logs before the process exits.
process.on("unhandledRejection", (reason) => {
  app.log.error({ err: reason }, "unhandled promise rejection");
  reportError(reason, { source: "unhandledRejection" });
});
process.on("uncaughtException", (err) => {
  app.log.fatal({ err }, "uncaught exception");
  reportError(err, { source: "uncaughtException" });
  void shutdown("uncaughtException", 1);
});

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (err) {
  app.log.error(err);
  await flushErrorReporting();
  process.exit(1);
}
