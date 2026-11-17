import {
  apiErrorSchema,
  deviceListResponseSchema,
  deviceSchema,
  pairingCodeResponseSchema,
  registerDeviceSchema,
} from "@restoos/shared";
import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { ModuleDeps } from "../../module-deps";
import { tenantOf } from "../../plugins/tenant";
import {
  listDevices,
  newPairingCode,
  registerDevice,
  unpairDevice,
  type DeviceDeps,
} from "./service";

// /api/owner/devices — register and pair restaurant devices (M1-T6). Device admin uses the
// owner/manager staff-admin permission (plan §5.4 has no separate device permission).

const errors = {
  400: apiErrorSchema,
  401: apiErrorSchema,
  403: apiErrorSchema,
  404: apiErrorSchema,
  409: apiErrorSchema,
};
const idParams = z.object({ id: z.string().min(1) });

export const deviceRoutes =
  (m: ModuleDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const preHandler = [m.resolveTenant, m.requirePermission("staff.manage"), m.requireOutlet];
    const deps = (request: FastifyRequest): DeviceDeps => {
      const ctx = tenantOf(request);
      return { ctx, db: m.getTenantDb(ctx), staffAuth: m.staffAuth };
    };

    app.get(
      "/owner/devices",
      {
        preHandler,
        schema: {
          tags: ["devices"],
          summary: "The outlet's devices",
          response: { 200: deviceListResponseSchema, ...errors },
        },
      },
      async (request) => ({ devices: await listDevices(deps(request)) }),
    );

    app.post(
      "/owner/devices",
      {
        preHandler,
        schema: {
          tags: ["devices"],
          summary: "Register a device and get its one-time pairing code",
          body: registerDeviceSchema,
          response: { 201: pairingCodeResponseSchema, ...errors },
        },
      },
      async (request, reply) =>
        reply.code(201).send(await registerDevice(deps(request), request.body)),
    );

    app.post(
      "/owner/devices/:id/pairing-code",
      {
        preHandler,
        schema: {
          tags: ["devices"],
          summary: "Issue a new pairing code (the previous one stops working)",
          params: idParams,
          response: { 200: pairingCodeResponseSchema, ...errors },
        },
      },
      (request) => newPairingCode(deps(request), request.params.id),
    );

    app.post(
      "/owner/devices/:id/unpair",
      {
        preHandler,
        schema: {
          tags: ["devices"],
          summary: "Unpair a device and sign out everyone on it",
          params: idParams,
          response: { 200: deviceSchema, ...errors },
        },
      },
      (request) => unpairDevice(deps(request), request.params.id),
    );
  };
