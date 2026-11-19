import {
  apiErrorSchema,
  guestOrderInputSchema,
  guestOrderResultSchema,
  publicMenuSchema,
  tableOrdersSchema,
} from "@restoos/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { AppError } from "../../lib/errors";
import type { PublicMenuService, PublicTable } from "../../lib/public-menu";
import type { ModuleDeps } from "../../module-deps";
import * as guest from "./service";

// /api/public/* — the customer page (no login; scoped by the table's QR token, plan §7).
// M2-T5 menu, M5-T6b guest ordering + this sitting's order status.
// Rate limits for public routes arrive with the M14-T1 security pass.

const params = z.object({ qrToken: z.string().max(100) });

export const publicRoutes =
  ({
    publicMenu,
    m,
  }: {
    publicMenu: PublicMenuService;
    m: Pick<ModuleDeps, "getTenantDb" | "entitlements" | "events">;
  }): FastifyPluginAsyncZod =>
  async (app) => {
    const tableOf = async (qrToken: string): Promise<PublicTable> => {
      const table = await publicMenu.findTable(qrToken);
      if (!table) {
        throw new AppError(
          404,
          "TABLE_NOT_FOUND",
          "This QR code isn't active. Ask the staff for help.",
        );
      }
      return table;
    };
    const guestDeps = (table: PublicTable): guest.GuestDeps => {
      const ctx = guest.guestContext(table);
      return { ctx, db: m.getTenantDb(ctx), events: m.events, entitlements: m.entitlements };
    };

    app.get(
      "/public/table/:qrToken",
      {
        schema: {
          tags: ["public"],
          summary: "Outlet + table + menu for the customer page (cached; fresh after any change)",
          params,
          response: { 200: publicMenuSchema, 404: apiErrorSchema },
        },
      },
      async (request, reply) => {
        const table = await tableOf(request.params.qrToken);
        const menu = await publicMenu.getOutletMenu(table);
        // Plan check outside the cache: a downgrade turns guest ordering off at once.
        const orderingMode = await guest.effectiveOrderingMode(
          m.entitlements,
          table.outletId,
          menu.outlet.orderingMode,
        );
        // Freshness comes from busting the Redis cache, not from browser caching.
        void reply.header("cache-control", "no-store");
        return { ...menu, outlet: { ...menu.outlet, orderingMode }, table: { label: table.label } };
      },
    );

    app.post(
      "/public/table/:qrToken/order",
      {
        schema: {
          tags: ["public"],
          summary: "Guest order from the QR menu (approval or direct, per ordering mode + plan)",
          params,
          body: guestOrderInputSchema,
          response: {
            200: guestOrderResultSchema,
            201: guestOrderResultSchema,
            400: apiErrorSchema,
            403: apiErrorSchema,
            404: apiErrorSchema,
            409: apiErrorSchema,
          },
        },
      },
      async (request, reply) => {
        const table = await tableOf(request.params.qrToken);
        const result = await guest.placeGuestOrder(guestDeps(table), table, request.body);
        return reply.code(result.created ? 201 : 200).send(result);
      },
    );

    app.get(
      "/public/table/:qrToken/orders",
      {
        schema: {
          tags: ["public"],
          summary: "This sitting's guest orders and their status",
          params,
          response: { 200: tableOrdersSchema, 404: apiErrorSchema },
        },
      },
      async (request, reply) => {
        const table = await tableOf(request.params.qrToken);
        void reply.header("cache-control", "no-store");
        return guest.tableOrders(guestDeps(table), table);
      },
    );
  };
