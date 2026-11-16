import type { PrismaClient } from "@restoos/db";
import { apiErrorSchema, onboardingRequestSchema, onboardingResponseSchema } from "@restoos/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Auth } from "../../lib/auth";
import { AlreadyOnboardedError, completeOnboarding } from "../../lib/onboarding";
import { requireOwnerSession } from "../../plugins/auth";

export type OnboardingRouteDeps = { auth: Auth; prisma: PrismaClient };

export const onboardingRoutes =
  ({ auth, prisma }: OnboardingRouteDeps): FastifyPluginAsyncZod =>
  async (app) => {
    app.post(
      "/onboarding",
      {
        schema: {
          tags: ["onboarding"],
          summary: "Create the owner's organisation and first outlet",
          body: onboardingRequestSchema,
          response: { 201: onboardingResponseSchema, 401: apiErrorSchema, 409: apiErrorSchema },
        },
      },
      async (request, reply) => {
        const session = await requireOwnerSession(auth, request, reply);
        if (!session) return reply;
        try {
          const created = await completeOnboarding(prisma, session.user.id, request.body);
          return await reply.code(201).send(created);
        } catch (err) {
          if (err instanceof AlreadyOnboardedError) {
            return reply
              .code(409)
              .send({ error: { code: "ALREADY_ONBOARDED", message: err.message } });
          }
          throw err;
        }
      },
    );
  };
