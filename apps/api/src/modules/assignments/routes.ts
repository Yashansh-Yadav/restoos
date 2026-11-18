import {
  apiErrorSchema,
  assignmentBoardSchema,
  assignSectionSchema,
  assignTableSchema,
} from "@restoos/shared";
import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { ModuleDeps } from "../../module-deps";
import { tenantOf } from "../../plugins/tenant";
import * as assignments from "./service";

// /api/staff/assignments — who looks after which table this shift (M3-T3). Permission
// table.assign: a manager on a tablet, or the owner on the web (with the outlet header).

const errors = {
  400: apiErrorSchema,
  401: apiErrorSchema,
  403: apiErrorSchema,
  404: apiErrorSchema,
  409: apiErrorSchema,
};
const tags = ["assignments"];
const noContent = { 204: z.null(), ...errors };

export const assignmentRoutes =
  (m: ModuleDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const preHandler = [m.resolveTenant, m.requirePermission("table.assign"), m.requireOutlet];
    const deps = (request: FastifyRequest): assignments.AssignmentDeps => {
      const ctx = tenantOf(request);
      return { ctx, db: m.getTenantDb(ctx), events: m.events };
    };

    app.get(
      "/staff/assignments",
      {
        preHandler,
        schema: {
          tags,
          summary: "Butlers, their tables this shift, and the floor",
          response: { 200: assignmentBoardSchema, ...errors },
        },
      },
      (request) => assignments.getBoard(deps(request)),
    );

    app.put(
      "/staff/assignments/tables/:tableId",
      {
        preHandler,
        schema: {
          tags,
          summary: "Give a table to a butler (moves it), or null to take it off",
          params: z.object({ tableId: z.string().min(1) }),
          body: assignTableSchema,
          response: noContent,
        },
      },
      async (request, reply) => {
        await assignments.assignTable(
          deps(request),
          request.params.tableId,
          request.body.employeeId,
        );
        return reply.code(204).send(null);
      },
    );

    app.put(
      "/staff/assignments/sections/:sectionId",
      {
        preHandler,
        schema: {
          tags,
          summary: "Give every table in a section to one butler",
          params: z.object({ sectionId: z.string().min(1) }),
          body: assignSectionSchema,
          response: noContent,
        },
      },
      async (request, reply) => {
        await assignments.assignSection(
          deps(request),
          request.params.sectionId,
          request.body.employeeId,
        );
        return reply.code(204).send(null);
      },
    );
  };
