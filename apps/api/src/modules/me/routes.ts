import type { PrismaClient } from "@restoos/db";
import { apiErrorSchema, authConfigSchema, meResponseSchema } from "@restoos/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Auth } from "../../lib/auth";
import { getMe } from "../../lib/identity";
import { requireOwnerSession } from "../../plugins/auth";

export type MeRouteDeps = { auth: Auth; prisma: PrismaClient; googleEnabled: boolean };

export const meRoutes =
  ({ auth, prisma, googleEnabled }: MeRouteDeps): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      "/me",
      {
        schema: {
          tags: ["auth"],
          summary: "The signed-in owner and whether onboarding is still needed",
          response: { 200: meResponseSchema, 401: apiErrorSchema },
        },
      },
      async (request, reply) => {
        const session = await requireOwnerSession(auth, request, reply);
        if (!session) return reply;
        return getMe(prisma, session.user);
      },
    );

    app.get(
      "/auth-config",
      {
        schema: {
          tags: ["auth"],
          summary: "Sign-in methods available on this server (public)",
          response: { 200: authConfigSchema },
        },
      },
      () => ({ google: googleEnabled, phone: true }),
    );
  };
