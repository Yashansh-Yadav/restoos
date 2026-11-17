import multipart from "@fastify/multipart";
import {
  addOnGroupInputSchema,
  addOnGroupSchema,
  apiErrorSchema,
  categoryInputSchema,
  categoryOrderSchema,
  categoryUpdateSchema,
  itemInputSchema,
  itemUpdateSchema,
  MENU_IMAGE_MAX_BYTES,
  menuCategorySchema,
  menuItemSchema,
  ownerMenuSchema,
} from "@restoos/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { AppError } from "../../lib/errors";
import type { ModuleDeps } from "../../module-deps";
import { outletOf, tenantOf } from "../../plugins/tenant";
import * as menu from "./service";
import { buildMenuWorkbook, menuToRows } from "./template";

// /api/owner/menu — menu editing for the selected outlet (M2-T1). Permission menu.edit.

const errors = {
  400: apiErrorSchema,
  401: apiErrorSchema,
  403: apiErrorSchema,
  404: apiErrorSchema,
  409: apiErrorSchema,
};
const idParams = z.object({ id: z.string().min(1) });
const tag = ["menu"];

export const menuRoutes =
  (m: ModuleDeps): FastifyPluginAsyncZod =>
  async (app) => {
    // Multipart only for this module's photo upload; a little headroom over the 5 MB rule so
    // the size check below can answer with our own message.
    await app.register(multipart, { limits: { files: 1, fileSize: MENU_IMAGE_MAX_BYTES + 1 } });

    const preHandler = [m.resolveTenant, m.requirePermission("menu.edit"), m.requireOutlet];
    const deps = (request: FastifyRequest): menu.MenuDeps => {
      const ctx = tenantOf(request);
      return { ctx, db: m.getTenantDb(ctx), storage: m.storage, events: m.events };
    };

    app.get(
      "/owner/menu",
      {
        preHandler,
        schema: {
          tags: tag,
          summary: "The outlet's whole menu",
          response: { 200: ownerMenuSchema, ...errors },
        },
      },
      (request) => menu.getMenu(deps(request)),
    );

    // Excel (M2-T2): the empty template, and the current menu for edit-and-re-import (M2-T3).
    const xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const sendWorkbook = async (
      request: FastifyRequest,
      reply: FastifyReply,
      kind: "template" | "export",
    ) => {
      const d = deps(request);
      const outlet = await d.db.outlet.findUnique({
        where: { id: outletOf(request) },
        select: { name: true },
      });
      const outletName = outlet?.name ?? "";
      const bytes =
        kind === "template"
          ? await buildMenuWorkbook({ outletName })
          : await buildMenuWorkbook({ outletName, rows: menuToRows(await menu.getMenu(d)) });
      const name = kind === "template" ? "restoos-menu-template.xlsx" : "restoos-menu.xlsx";
      return reply
        .header("content-type", xlsx)
        .header("content-disposition", `attachment; filename="${name}"`)
        .header("cache-control", "no-store")
        .send(bytes);
    };
    const download = { querystring: z.object({ outletId: z.string().optional() }) };
    app.get(
      "/owner/menu/template.xlsx",
      {
        preHandler,
        schema: { tags: tag, summary: "Excel template with example rows", ...download },
      },
      (request, reply) => sendWorkbook(request, reply, "template"),
    );
    app.get(
      "/owner/menu/export.xlsx",
      {
        preHandler,
        schema: {
          tags: tag,
          summary: "The current menu as Excel (edit and re-import)",
          ...download,
        },
      },
      (request, reply) => sendWorkbook(request, reply, "export"),
    );

    // Categories
    app.post(
      "/owner/menu/categories",
      {
        preHandler,
        schema: {
          tags: tag,
          summary: "Add a category",
          body: categoryInputSchema,
          response: { 201: menuCategorySchema, ...errors },
        },
      },
      async (request, reply) =>
        reply.code(201).send(await menu.createCategory(deps(request), request.body)),
    );
    app.patch(
      "/owner/menu/categories/:id",
      {
        preHandler,
        schema: {
          tags: tag,
          summary: "Rename, translate or hide a category",
          params: idParams,
          body: categoryUpdateSchema,
          response: { 200: menuCategorySchema, ...errors },
        },
      },
      (request) => menu.updateCategory(deps(request), request.params.id, request.body),
    );
    app.put(
      "/owner/menu/categories/order",
      {
        preHandler,
        schema: {
          tags: tag,
          summary: "Save the category order",
          body: categoryOrderSchema,
          response: { 204: z.null(), ...errors },
        },
      },
      async (request, reply) => {
        await menu.reorderCategories(deps(request), request.body.ids);
        return reply.code(204).send(null);
      },
    );

    // Items
    app.post(
      "/owner/menu/items",
      {
        preHandler,
        schema: {
          tags: tag,
          summary: "Add an item (with sizes and add-on groups)",
          body: itemInputSchema,
          response: { 201: menuItemSchema, ...errors },
        },
      },
      async (request, reply) =>
        reply.code(201).send(await menu.createItem(deps(request), request.body)),
    );
    app.patch(
      "/owner/menu/items/:id",
      {
        preHandler,
        schema: {
          tags: tag,
          summary: "Edit or hide an item (sizes/add-ons replaced when sent)",
          params: idParams,
          body: itemUpdateSchema,
          response: { 200: menuItemSchema, ...errors },
        },
      },
      (request) => menu.updateItem(deps(request), request.params.id, request.body),
    );
    app.put(
      "/owner/menu/items/:id/image",
      {
        preHandler,
        schema: {
          tags: tag,
          summary: "Upload the item photo (multipart, field `image`; JPG/PNG/WebP up to 5 MB)",
          params: idParams,
          response: { 200: menuItemSchema, ...errors },
        },
      },
      async (request) => {
        const file = await request.file();
        if (!file) throw new AppError(400, "IMAGE_REQUIRED", "Choose a photo to upload.");
        let bytes: Buffer;
        try {
          bytes = await file.toBuffer();
        } catch {
          throw new AppError(
            400,
            "IMAGE_TOO_LARGE",
            "Photos can be up to 5 MB. Try a smaller one.",
          );
        }
        return menu.setItemImage(deps(request), request.params.id, bytes);
      },
    );
    app.delete(
      "/owner/menu/items/:id/image",
      {
        preHandler,
        schema: {
          tags: tag,
          summary: "Remove the item photo",
          params: idParams,
          response: { 200: menuItemSchema, ...errors },
        },
      },
      (request) => menu.removeItemImage(deps(request), request.params.id),
    );

    // Add-on groups
    app.post(
      "/owner/menu/addon-groups",
      {
        preHandler,
        schema: {
          tags: tag,
          summary: "Add an add-on group",
          body: addOnGroupInputSchema,
          response: { 201: addOnGroupSchema, ...errors },
        },
      },
      async (request, reply) =>
        reply.code(201).send(await menu.createAddOnGroup(deps(request), request.body)),
    );
    app.put(
      "/owner/menu/addon-groups/:id",
      {
        preHandler,
        schema: {
          tags: tag,
          summary: "Replace an add-on group",
          params: idParams,
          body: addOnGroupInputSchema,
          response: { 200: addOnGroupSchema, ...errors },
        },
      },
      (request) => menu.updateAddOnGroup(deps(request), request.params.id, request.body),
    );
    app.delete(
      "/owner/menu/addon-groups/:id",
      {
        preHandler,
        schema: {
          tags: tag,
          summary: "Delete an add-on group (items lose it; past orders keep their snapshot)",
          params: idParams,
          response: { 204: z.null(), ...errors },
        },
      },
      async (request, reply) => {
        await menu.deleteAddOnGroup(deps(request), request.params.id);
        return reply.code(204).send(null);
      },
    );
  };
