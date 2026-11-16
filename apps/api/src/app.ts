import type { PrismaClient } from "@restoos/db";
import Fastify, { type FastifyServerOptions } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { Auth } from "./lib/auth";
import { REQUEST_ID_HEADER, requestIdOptions } from "./lib/logger";
import type { ConsoleOtpProvider } from "./lib/otp/provider";
import { devRoutes } from "./modules/dev/routes";
import { healthRoutes } from "./modules/health/routes";
import { meRoutes } from "./modules/me/routes";
import { registerAuthHandler } from "./plugins/auth";
import { registerDocs } from "./plugins/docs";
import { registerErrorHandling, type ServerErrorHook } from "./plugins/errors";

/** Runtime dependencies. Omitted in DB-free unit tests, so auth routes aren't registered there. */
export type AppDeps = {
  prisma: PrismaClient;
  auth: Auth;
  /** Public web origin (APP_URL) — Better Auth runs on it via the same-origin /api proxy. */
  appUrl: string;
  googleEnabled: boolean;
  /** Set only in development/test with the console OTP provider: enables GET /api/dev/last-otp. */
  devOtp?: ConsoleOtpProvider;
};

export type BuildAppOptions = {
  logger?: FastifyServerOptions["logger"];
  /** Serve OpenAPI docs at /api/docs. Defaults to on outside production. */
  docs?: boolean;
  /** Called for every 5xx — server.ts wires it to Sentry (reportError). */
  onServerError?: ServerErrorHook;
  deps?: AppDeps;
};

/** Builds the API without listening — shared by server.ts, worker.ts and tests (app.inject). */
export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: options.logger ?? false,
    ...requestIdOptions(),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandling(app, { onServerError: options.onServerError });

  // Echo the request id so users/support can quote it and it can be found in logs and Sentry.
  app.addHook("onRequest", async (req, reply) => {
    void reply.header(REQUEST_ID_HEADER, req.id);
  });

  if (options.docs ?? process.env.NODE_ENV !== "production") {
    await registerDocs(app);
  }

  const deps = options.deps;
  if (deps) registerAuthHandler(app, deps.auth, deps.appUrl);

  // Every route lives under /api (plan §7). Add one register() per module.
  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      if (deps) {
        await api.register(meRoutes(deps));
        if (deps.devOtp && process.env.NODE_ENV !== "production") {
          await api.register(devRoutes(deps.devOtp));
        }
      }
    },
    { prefix: "/api" },
  );

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
