import {
  apiErrorSchema,
  bulkTablesSchema,
  floorSchema,
  floorSectionSchema,
  floorTableSchema,
  layoutSchema,
  sectionInputSchema,
  sectionOrderSchema,
  tableInputSchema,
  tableUpdateSchema,
} from "@restoos/shared";
import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { ModuleDeps } from "../../module-deps";
import { tenantOf } from "../../plugins/tenant";
import * as floor from "./service";

// /api/owner/floor — sections and tables of the selected outlet (M3-T1). Permission floor.edit.

const errors = {
  400: apiErrorSchema,
  401: apiErrorSchema,
  403: apiErrorSchema,
  404: apiErrorSchema,
  409: apiErrorSchema,
};
const idParams = z.object({ id: z.string().min(1) });
const tags = ["floor"];
const noContent = { 204: z.null(), ...errors };

export const floorRoutes =
  (m: ModuleDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const preHandler = [m.resolveTenant, m.requirePermission("floor.edit"), m.requireOutlet];
    const deps = (request: FastifyRequest): floor.FloorDeps => {
      const ctx = tenantOf(request);
      return { ctx, db: m.getTenantDb(ctx), events: m.events };
    };

    app.get(
      "/owner/floor",
      {
        preHandler,
        schema: { tags, summary: "Sections and tables", response: { 200: floorSchema, ...errors } },
      },
      (request) => floor.getFloor(deps(request)),
    );

    // Sections
    app.post(
      "/owner/floor/sections",
      {
        preHandler,
        schema: {
          tags,
          summary: "Add a section",
          body: sectionInputSchema,
          response: { 201: floorSectionSchema, ...errors },
        },
      },
      async (request, reply) =>
        reply.code(201).send(await floor.createSection(deps(request), request.body.name)),
    );
    app.patch(
      "/owner/floor/sections/:id",
      {
        preHandler,
        schema: {
          tags,
          summary: "Rename a section",
          params: idParams,
          body: sectionInputSchema,
          response: noContent,
        },
      },
      async (request, reply) => {
        await floor.renameSection(deps(request), request.params.id, request.body.name);
        return reply.code(204).send(null);
      },
    );
    app.put(
      "/owner/floor/sections/order",
      {
        preHandler,
        schema: {
          tags,
          summary: "Save the section order",
          body: sectionOrderSchema,
          response: noContent,
        },
      },
      async (request, reply) => {
        await floor.reorderSections(deps(request), request.body.ids);
        return reply.code(204).send(null);
      },
    );
    app.delete(
      "/owner/floor/sections/:id",
      {
        preHandler,
        schema: { tags, summary: "Delete an empty section", params: idParams, response: noContent },
      },
      async (request, reply) => {
        await floor.deleteSection(deps(request), request.params.id);
        return reply.code(204).send(null);
      },
    );

    // Tables
    app.post(
      "/owner/floor/tables",
      {
        preHandler,
        schema: {
          tags,
          summary: "Add a table",
          body: tableInputSchema,
          response: { 201: floorTableSchema, ...errors },
        },
      },
      async (request, reply) =>
        reply.code(201).send(await floor.createTable(deps(request), request.body)),
    );
    app.post(
      "/owner/floor/tables/bulk",
      {
        preHandler,
        schema: {
          tags,
          summary: "Add a numbered range of tables (all or nothing)",
          body: bulkTablesSchema,
          response: { 201: z.object({ tables: z.array(floorTableSchema) }), ...errors },
        },
      },
      async (request, reply) =>
        reply.code(201).send({ tables: await floor.bulkCreateTables(deps(request), request.body) }),
    );
    app.patch(
      "/owner/floor/tables/:id",
      {
        preHandler,
        schema: {
          tags,
          summary: "Edit a table (name, seats, section, position)",
          params: idParams,
          body: tableUpdateSchema,
          response: { 200: floorTableSchema, ...errors },
        },
      },
      (request) => floor.updateTable(deps(request), request.params.id, request.body),
    );
    app.put(
      "/owner/floor/layout",
      {
        preHandler,
        schema: {
          tags,
          summary: "Save table positions after dragging",
          body: layoutSchema,
          response: noContent,
        },
      },
      async (request, reply) => {
        await floor.saveLayout(deps(request), request.body);
        return reply.code(204).send(null);
      },
    );
    app.delete(
      "/owner/floor/tables/:id",
      {
        preHandler,
        schema: {
          tags,
          summary: "Delete a table that was never used",
          params: idParams,
          response: noContent,
        },
      },
      async (request, reply) => {
        await floor.deleteTable(deps(request), request.params.id);
        return reply.code(204).send(null);
      },
    );
  };
