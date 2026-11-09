import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { healthResponseSchema } from "@restoos/shared";

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/health",
    {
      schema: {
        tags: ["system"],
        summary: "Liveness check",
        response: { 200: healthResponseSchema },
      },
    },
    () => ({ ok: true as const }),
  );
};
