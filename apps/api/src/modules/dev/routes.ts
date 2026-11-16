import { indianMobileSchema } from "@restoos/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { ConsoleOtpProvider } from "../../lib/otp/provider";

// DEV/TEST ONLY: lets E2E tests read the OTP the console provider "sent". buildApp registers this
// only when NODE_ENV !== "production" AND the console provider is in use; env validation also
// forbids OTP_PROVIDER=console in production. Never add real data access here.
export const devRoutes =
  (otp: ConsoleOtpProvider): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      "/dev/last-otp",
      {
        schema: {
          hide: true,
          querystring: z.object({ phone: indianMobileSchema }),
          response: { 200: z.object({ code: z.string().nullable() }) },
        },
      },
      (request) => ({ code: otp.lastCode(request.query.phone) ?? null }),
    );
  };
