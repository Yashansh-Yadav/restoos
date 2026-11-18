import { apiErrorSchema, outletSettingsSchema, updateOutletSettingsSchema } from "@restoos/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { writeAudit } from "../../lib/audit";
import { notFound } from "../../lib/errors";
import type { ModuleDeps } from "../../module-deps";
import { outletOf, tenantOf } from "../../plugins/tenant";

// /api/owner/outlet/settings (M1-T7): outlet-level switches. Today: shift auto-start. Guarded by
// staff.manage until a general settings permission exists (it's a staff-scheduling setting).

const errors = {
  400: apiErrorSchema,
  401: apiErrorSchema,
  403: apiErrorSchema,
  404: apiErrorSchema,
};
const select = { autoStartShift: true };

export const outletSettingsRoutes =
  (m: ModuleDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const preHandler = [m.resolveTenant, m.requirePermission("staff.manage"), m.requireOutlet];

    app.get(
      "/owner/outlet/settings",
      {
        preHandler,
        schema: {
          tags: ["outlet"],
          summary: "The outlet's settings",
          response: { 200: outletSettingsSchema, ...errors },
        },
      },
      async (request) => {
        const db = m.getTenantDb(tenantOf(request));
        const outlet = await db.outlet.findUnique({ where: { id: outletOf(request) }, select });
        if (!outlet) throw notFound("Outlet");
        return outlet;
      },
    );

    app.patch(
      "/owner/outlet/settings",
      {
        preHandler,
        schema: {
          tags: ["outlet"],
          summary: "Change outlet settings (audited)",
          body: updateOutletSettingsSchema,
          response: { 200: outletSettingsSchema, ...errors },
        },
      },
      async (request) => {
        const ctx = tenantOf(request);
        const db = m.getTenantDb(ctx);
        const id = outletOf(request);
        const before = await db.outlet.findUnique({ where: { id }, select });
        if (!before) throw notFound("Outlet");
        const after = await db.outlet.update({ where: { id }, data: request.body, select });
        await writeAudit(db, ctx, "outlet.settingsChanged", "Outlet", id, { before, after });
        // Ordering mode etc. are part of the customer menu (M2-T5): bust its cache.
        await m.events.publishEvent(ctx, "outlet.settingsChanged", { outletId: id });
        return after;
      },
    );
  };
