import {
  apiErrorSchema,
  createEmployeeSchema,
  employeeSchema,
  setPinSchema,
  staffListResponseSchema,
  updateEmployeeSchema,
} from "@restoos/shared";
import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { ModuleDeps } from "../../module-deps";
import { outletOf, tenantOf } from "../../plugins/tenant";
import { rooms } from "../../socket/rooms";
import { createEmployee, listStaff, setPin, updateEmployee, type StaffDeps } from "./service";

// /api/owner/staff — owners and managers manage the selected outlet's staff (M1-T5).

const errors = {
  400: apiErrorSchema,
  401: apiErrorSchema,
  403: apiErrorSchema,
  404: apiErrorSchema,
};
const idParams = z.object({ id: z.string().min(1) });

export const staffRoutes =
  (m: ModuleDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const preHandler = [m.resolveTenant, m.requirePermission("staff.manage"), m.requireOutlet];
    const deps = (request: FastifyRequest): StaffDeps => {
      const ctx = tenantOf(request);
      return { ctx, db: m.getTenantDb(ctx), entitlements: m.entitlements };
    };

    app.get(
      "/owner/staff",
      {
        preHandler,
        schema: {
          tags: ["staff"],
          summary: "List the outlet's staff and the plan's staff limit",
          response: { 200: staffListResponseSchema, ...errors },
        },
      },
      (request) => listStaff(deps(request)),
    );

    app.post(
      "/owner/staff",
      {
        preHandler,
        schema: {
          tags: ["staff"],
          summary: "Add a staff member with a PIN",
          body: createEmployeeSchema,
          response: { 201: employeeSchema, ...errors },
        },
      },
      async (request, reply) =>
        reply.code(201).send(await createEmployee(deps(request), request.body)),
    );

    app.patch(
      "/owner/staff/:id",
      {
        preHandler,
        schema: {
          tags: ["staff"],
          summary: "Edit, deactivate or reactivate a staff member",
          params: idParams,
          body: updateEmployeeSchema,
          response: { 200: employeeSchema, ...errors },
        },
      },
      async (request) => {
        const employee = await updateEmployee(deps(request), request.params.id, request.body);
        // Deactivated: their sessions are revoked; cut their live connection too (M4-T2).
        if (request.body.isActive === false) {
          m.realtime.disconnect([rooms.employee(outletOf(request), employee.id)]);
        }
        return employee;
      },
    );

    app.put(
      "/owner/staff/:id/pin",
      {
        preHandler,
        schema: {
          tags: ["staff"],
          summary: "Set a new PIN (signs the person out on every device)",
          params: idParams,
          body: setPinSchema,
          response: { 204: z.null(), ...errors },
        },
      },
      async (request, reply) => {
        await setPin(deps(request), request.params.id, request.body.pin);
        m.realtime.disconnect([rooms.employee(outletOf(request), request.params.id)]);
        return reply.code(204).send(null);
      },
    );
  };
