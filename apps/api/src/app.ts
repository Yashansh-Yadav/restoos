import Fastify, { type FastifyServerOptions } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { REQUEST_ID_HEADER, requestIdOptions } from "./lib/logger";
import { healthRoutes } from "./modules/health/routes";
import { registerDocs } from "./plugins/docs";
import { registerErrorHandling, type ServerErrorHook } from "./plugins/errors";

export type BuildAppOptions = {
  logger?: FastifyServerOptions["logger"];
  /** Serve OpenAPI docs at /api/docs. Defaults to on outside production. */
  docs?: boolean;
  /** Called for every 5xx — server.ts wires it to Sentry (reportError). */
  onServerError?: ServerErrorHook;
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

  // Every route lives under /api (plan §7). Add one register() per module.
  await app.register(
    async (api) => {
      await api.register(healthRoutes);
    },
    { prefix: "/api" },
  );

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
