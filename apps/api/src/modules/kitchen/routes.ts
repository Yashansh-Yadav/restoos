import {
  apiErrorSchema,
  kitchenBoardSchema,
  kotStageSchema,
  moveKotSchema,
  readyListSchema,
  servedInputSchema,
} from "@restoos/shared";
import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { ModuleDeps } from "../../module-deps";
import { tenantOf } from "../../plugins/tenant";
import * as kitchen from "./service";

// Kitchen display (M5-T3; permission kot.updateStatus: kitchen, manager, owners) and the floor
// staff's Ready to Serve list (M5-T4; permission order.create: butlers, cashiers, managers).
// Never gated by plan (rule 5: never block the kitchen).

const errors = {
  400: apiErrorSchema,
  401: apiErrorSchema,
  403: apiErrorSchema,
  404: apiErrorSchema,
  409: apiErrorSchema,
};
const tags = ["kitchen"];

export const kitchenRoutes =
  (m: ModuleDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const preHandler = [m.resolveTenant, m.requirePermission("kot.updateStatus"), m.requireOutlet];
    const deps = (request: FastifyRequest): kitchen.KitchenDeps => {
      const ctx = tenantOf(request);
      return { ctx, db: m.getTenantDb(ctx), events: m.events };
    };

    app.get(
      "/staff/kitchen",
      {
        preHandler,
        schema: {
          tags,
          summary: "Tickets still to cook or hand over, oldest first",
          response: { 200: kitchenBoardSchema, ...errors },
        },
      },
      (request) => kitchen.getBoard(deps(request)),
    );

    app.post(
      "/staff/kots/:id/stage",
      {
        preHandler,
        schema: {
          tags,
          summary: "Move a ticket one step: New ↔ Preparing ↔ Ready",
          params: z.object({ id: z.string().min(1) }),
          body: moveKotSchema,
          response: {
            200: z.object({ id: z.string(), number: z.number().int(), stage: kotStageSchema }),
            ...errors,
          },
        },
      },
      (request) => kitchen.moveKot(deps(request), request.params.id, request.body.to),
    );

    // Ready to serve (M5-T4): the floor staff, not the kitchen.
    const floorStaff = [m.resolveTenant, m.requirePermission("order.create"), m.requireOutlet];
    app.get(
      "/staff/ready",
      {
        preHandler: floorStaff,
        schema: {
          tags,
          summary: "Tickets the kitchen has marked ready, oldest first",
          response: { 200: readyListSchema, ...errors },
        },
      },
      (request) => kitchen.getReady(deps(request)),
    );
    app.post(
      "/staff/kots/:id/served",
      {
        preHandler: floorStaff,
        schema: {
          tags,
          summary: "Mark a ready ticket served (or undo)",
          params: z.object({ id: z.string().min(1) }),
          body: servedInputSchema,
          response: {
            200: z.object({ id: z.string(), number: z.number().int(), served: z.boolean() }),
            ...errors,
          },
        },
      },
      (request) => kitchen.setServed(deps(request), request.params.id, request.body.served),
    );
  };
