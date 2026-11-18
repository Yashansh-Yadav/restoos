import {
  apiErrorSchema,
  manualTableEventSchema,
  staffFloorSchema,
  tableStatusSchema,
} from "@restoos/shared";
import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { ModuleDeps } from "../../module-deps";
import { tenantOf } from "../../plugins/tenant";
import * as tables from "./service";

// /api/staff/floor and table status taps (M3-T4). Permission order.create: butlers, cashiers,
// managers (and owners/admins on the web); the kitchen doesn't work the floor.

const errors = {
  400: apiErrorSchema,
  401: apiErrorSchema,
  403: apiErrorSchema,
  404: apiErrorSchema,
  409: apiErrorSchema,
};
const tags = ["tables"];

export const tableRoutes =
  (m: ModuleDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const preHandler = [m.resolveTenant, m.requirePermission("order.create"), m.requireOutlet];
    const deps = (request: FastifyRequest): tables.TablesDeps => {
      const ctx = tenantOf(request);
      return { ctx, db: m.getTenantDb(ctx), events: m.events };
    };

    app.get(
      "/staff/floor",
      {
        preHandler,
        schema: {
          tags,
          summary: "Every table with its status, butler and alerts",
          response: { 200: staffFloorSchema, ...errors },
        },
      },
      (request) => tables.getStaffFloor(deps(request)),
    );

    app.post(
      "/staff/tables/:id/status",
      {
        preHandler,
        schema: {
          tags,
          summary: "Seat guests, guests left, clear, or mark cleaned",
          params: z.object({ id: z.string().min(1) }),
          body: z.object({ event: manualTableEventSchema }),
          response: {
            200: z.object({ id: z.string(), label: z.string(), status: tableStatusSchema }),
            ...errors,
          },
        },
      },
      async (request) => {
        const t = await tables.changeStatus(deps(request), request.params.id, request.body.event);
        return { id: t.id, label: t.label, status: t.status };
      },
    );
  };
