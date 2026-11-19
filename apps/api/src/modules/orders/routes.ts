import {
  apiErrorSchema,
  createdOrderSchema,
  createOrderSchema,
  orderDecisionSchema,
  orderPadSchema,
  rejectOrderSchema,
  voidedItemSchema,
  voidItemInputSchema,
} from "@restoos/shared";
import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { ModuleDeps } from "../../module-deps";
import { tenantOf } from "../../plugins/tenant";
import * as orders from "./service";

// Staff ordering (M5-T1): the order pad for a table and "Send to kitchen". Permission
// order.create (butler, cashier, manager; owners on the web). Never gated by plan (rule 5).
// Voiding a sent item (M5-T5) needs order.voidItem (managers, owners) and is audited.

const errors = {
  400: apiErrorSchema,
  401: apiErrorSchema,
  403: apiErrorSchema,
  404: apiErrorSchema,
  409: apiErrorSchema,
};
const tags = ["orders"];

export const orderRoutes =
  (m: ModuleDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const preHandler = [m.resolveTenant, m.requirePermission("order.create"), m.requireOutlet];
    const deps = (request: FastifyRequest): orders.OrderDeps => {
      const ctx = tenantOf(request);
      return { ctx, db: m.getTenantDb(ctx), events: m.events };
    };

    app.get(
      "/staff/tables/:id/order-pad",
      {
        preHandler,
        schema: {
          tags,
          summary: "Menu, popular items and what's already been sent, for one table",
          params: z.object({ id: z.string().min(1) }),
          response: { 200: orderPadSchema, ...errors },
        },
      },
      (request) => orders.getOrderPad(deps(request), request.params.id),
    );

    app.post(
      "/staff/orders",
      {
        preHandler,
        schema: {
          tags,
          summary: "Send to kitchen (idempotent on clientId)",
          body: createOrderSchema,
          response: { 200: createdOrderSchema, 201: createdOrderSchema, ...errors },
        },
      },
      async (request, reply) => {
        const { replay, ...order } = await orders.createOrder(deps(request), request.body);
        return reply.code(replay ? 200 : 201).send(order);
      },
    );

    app.post(
      "/staff/order-items/:id/void",
      {
        preHandler: [m.resolveTenant, m.requirePermission("order.voidItem"), m.requireOutlet],
        schema: {
          tags,
          summary: "Void a sent item (or some of it) with a reason — audited",
          params: z.object({ id: z.string().min(1) }),
          body: voidItemInputSchema,
          response: { 200: voidedItemSchema, ...errors },
        },
      },
      (request) => orders.voidItem(deps(request), request.params.id, request.body),
    );

    app.post(
      "/staff/orders/:id/approve",
      {
        preHandler,
        schema: {
          tags,
          summary: "Approve a guest order from the QR menu and send it to the kitchen",
          params: z.object({ id: z.string().min(1) }),
          response: { 200: orderDecisionSchema, ...errors },
        },
      },
      (request) => orders.approveOrder(deps(request), request.params.id),
    );

    app.post(
      "/staff/orders/:id/reject",
      {
        preHandler,
        schema: {
          tags,
          summary: "Turn down a guest order (the guest sees the reason)",
          params: z.object({ id: z.string().min(1) }),
          body: rejectOrderSchema,
          response: { 200: orderDecisionSchema, ...errors },
        },
      },
      (request) => orders.rejectOrder(deps(request), request.params.id, request.body.reason),
    );
  };
