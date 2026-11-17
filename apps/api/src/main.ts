// API start-up (loaded by server.ts only after the environment is valid).
import { createPrismaClient } from "@restoos/db";
import { buildApp } from "./app";
import type { ApiEnv } from "./env";
import { createAuth } from "./lib/auth";
import { loggerOptions } from "./lib/logger";
import { flushErrorReporting, initErrorReporting, reportError } from "./lib/observability";
import { ConsoleOtpProvider, type OtpProvider } from "./lib/otp/provider";
import { createRedis } from "./lib/redis";

function createOtpProvider(env: ApiEnv): OtpProvider {
  if (env.OTP_PROVIDER === "console") return new ConsoleOtpProvider();
  // Env validation already requires OTP_API_KEY; the real adapter lands once a provider is chosen.
  throw new Error(
    `OTP_PROVIDER=${env.OTP_PROVIDER} is not implemented yet (plan §18: choose SMS provider)`,
  );
}

export async function start(env: ApiEnv): Promise<void> {
  const sentryOn = await initErrorReporting(env);

  const prisma = createPrismaClient(env.DATABASE_URL);
  const redis = createRedis(env.REDIS_URL);
  const otp = createOtpProvider(env);
  const auth = createAuth({ prisma, redis, env, otp });

  const app = await buildApp({
    logger: loggerOptions(env),
    docs: env.NODE_ENV !== "production",
    onServerError: (err, req) =>
      reportError(err, { requestId: req.id, method: req.method, route: req.routeOptions.url }),
    deps: {
      prisma,
      redis,
      auth,
      appUrl: env.APP_URL,
      googleEnabled: Boolean(env.GOOGLE_CLIENT_ID),
      ...(otp instanceof ConsoleOtpProvider ? { devOtp: otp } : {}),
    },
  });
  app.addHook("onClose", async () => {
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
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
}
