import Fastify, { type FastifyServerOptions } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { healthRoutes } from "./modules/health/routes";
import { registerDocs } from "./plugins/docs";
import { registerErrorHandling } from "./plugins/errors";

export type BuildAppOptions = {
  logger?: FastifyServerOptions["logger"];
  /** Serve OpenAPI docs at /api/docs. Defaults to on outside production. */
  docs?: boolean;
};

/** Builds the API without listening — shared by server.ts, worker.ts and tests (app.inject). */
export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? false }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandling(app);

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
