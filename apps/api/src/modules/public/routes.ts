import { apiErrorSchema, publicMenuSchema } from "@restoos/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { AppError } from "../../lib/errors";
import type { PublicMenuService } from "../../lib/public-menu";

// /api/public/* — the customer page (no login; scoped by the table's QR token, plan §7).
// Rate limits for public routes arrive with the M14-T1 security pass.

export const publicRoutes =
  ({ publicMenu }: { publicMenu: PublicMenuService }): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      "/public/table/:qrToken",
      {
        schema: {
          tags: ["public"],
          summary: "Outlet + table + menu for the customer page (cached; fresh after any change)",
          params: z.object({ qrToken: z.string().max(100) }),
          response: { 200: publicMenuSchema, 404: apiErrorSchema },
        },
      },
      async (request, reply) => {
        const table = await publicMenu.findTable(request.params.qrToken);
        if (!table) {
          throw new AppError(
            404,
            "TABLE_NOT_FOUND",
            "This QR code isn't active. Ask the staff for help.",
          );
        }
        const menu = await publicMenu.getOutletMenu(table);
        // Freshness comes from busting the Redis cache, not from browser caching.
        void reply.header("cache-control", "no-store");
        return { ...menu, table: { label: table.label } };
      },
    );
  };
