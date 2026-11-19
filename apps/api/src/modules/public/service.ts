import type {
  GuestOrderResult,
  guestOrderInputSchema,
  OrderingMode,
  TableOrders,
} from "@restoos/shared";
import type { z } from "zod";
import { AppError } from "../../lib/errors";
import type { Entitlements } from "../../lib/entitlements";
import type { EventBus } from "../../lib/events";
import { createKotForOrder, type CreatedKot } from "../../lib/kots";
import type { PublicTable } from "../../lib/public-menu";
import { applyTableTransition, publishTableStatus, type TransitionResult } from "../../lib/tables";
import type { TenantContext, TenantDb } from "../../lib/tenant";
import { NOT_ACCEPTED, priceLines } from "../orders/service";

// Guest ordering from the table QR (M5-T6b). No login: the table's QR token is the key, and the
// work runs as a system actor scoped to that table's restaurant and outlet (getTenantDb).
//   SELF_ORDER_APPROVAL → PENDING_APPROVAL order (items NEW, no KOT); a free table is seated so
//                         the floor shows the waiting badge; staff Approve & Send (orders module).
//   SELF_ORDER          → exactly a staff send: table Ordered, OPEN order, KOT, in one transaction.
// Both need CUSTOMER_SELF_ORDER on the plan; without it the outlet is effectively menu-only.

export type GuestDeps = {
  db: TenantDb;
  ctx: TenantContext;
  events: EventBus;
  entitlements: Entitlements;
};
type GuestOrderInput = z.output<typeof guestOrderInputSchema>;

/** Table states where guests can't add an order (paid up, being cleaned). */
const CLOSED_TABLE = new Set(["PAID", "CLEANING"]);

export const guestContext = (table: PublicTable): TenantContext => ({
  organizationId: table.organizationId,
  outletId: table.outletId,
  actor: { kind: "system", reason: "guest-order" },
});

/** The ordering mode guests actually get: menu-only when the plan lacks the feature. */
export async function effectiveOrderingMode(
  entitlements: Entitlements,
  outletId: string,
  mode: OrderingMode,
): Promise<OrderingMode> {
  if (mode === "VIEW_ONLY") return mode;
  return (await entitlements.hasFeature(outletId, "CUSTOMER_SELF_ORDER")) ? mode : "VIEW_ONLY";
}

const isUniqueViolation = (err: unknown) =>
  err instanceof Error && "code" in err && err.code === "P2002";

export async function placeGuestOrder(
  { db, ctx, events, entitlements }: GuestDeps,
  table: PublicTable,
  input: GuestOrderInput,
): Promise<GuestOrderResult> {
  const outlet = await db.outlet.findUnique({
    where: { id: table.outletId },
    select: { orderingMode: true },
  });
  const mode = await effectiveOrderingMode(
    entitlements,
    table.outletId,
    outlet?.orderingMode ?? "VIEW_ONLY",
  );
  if (mode === "VIEW_ONLY") {
    throw new AppError(
      403,
      "ORDERING_OFF",
      "Ordering from the menu isn't available here. Please order with the staff.",
    );
  }

  // Rule 8: a retried Place Order changes nothing.
  const existing = await db.order.findUnique({
    where: { clientId: input.clientId },
    select: { id: true, status: true, tableSession: { select: { tableId: true } } },
  });
  if (existing) return replayOf(existing, table.id);

  const current = await db.diningTable.findUnique({
    where: { id: table.id },
    select: { status: true },
  });
  if (!current || CLOSED_TABLE.has(current.status)) {
    throw new AppError(
      409,
      "TABLE_NOT_ORDERING",
      "This table isn't taking orders right now. Please ask the staff.",
    );
  }

  const lines = await priceLines(db, ctx, input.items);
  const approval = mode === "SELF_ORDER_APPROVAL";

  let saved: { orderId: string; changed: TransitionResult | null; kot: CreatedKot | null };
  try {
    saved = await db.$transaction(async (tx) => {
      let changed: TransitionResult | null = null;
      let sessionId: string | null;
      if (!approval) {
        changed = await applyTableTransition(tx, ctx, table.id, "order");
        sessionId = changed.sessionId;
      } else if (current.status === "FREE") {
        // Seat the table so the waiting order belongs to these guests and shows on the floor.
        changed = await applyTableTransition(tx, ctx, table.id, "seat");
        sessionId = changed.sessionId;
      } else {
        const open = await tx.tableSession.findFirst({
          where: { tableId: table.id, closedAt: null },
          orderBy: { openedAt: "desc" },
          select: { id: true },
        });
        sessionId = open?.id ?? null;
        if (!sessionId) {
          throw new AppError(
            409,
            "TABLE_NOT_ORDERING",
            "This table isn't taking orders right now. Please ask the staff.",
          );
        }
      }
      const order = await tx.order.create({
        data: {
          organizationId: ctx.organizationId,
          outletId: table.outletId,
          tableSessionId: sessionId,
          source: "CUSTOMER",
          status: approval ? "PENDING_APPROVAL" : "OPEN",
          createdById: null,
          clientId: input.clientId,
          items: { create: lines },
        },
        select: { id: true },
      });
      const kot = approval ? null : await createKotForOrder(tx, ctx, order.id);
      return { orderId: order.id, changed, kot };
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const winner = await db.order.findUnique({
      where: { clientId: input.clientId },
      select: { id: true, status: true, tableSession: { select: { tableId: true } } },
    });
    if (!winner) throw err;
    return replayOf(winner, table.id);
  }

  if (saved.changed) await publishTableStatus(events, ctx, saved.changed);
  if (approval) {
    await events.publishEvent(ctx, "order.pendingApproval", {
      outletId: table.outletId,
      orderId: saved.orderId,
      tableId: table.id,
    });
  } else {
    await events.publishEvent(ctx, "order.created", {
      outletId: table.outletId,
      orderId: saved.orderId,
      tableId: table.id,
    });
    if (saved.kot) {
      await events.publishEvent(ctx, "kot.created", {
        outletId: table.outletId,
        kotId: saved.kot.id,
        number: saved.kot.number,
        orderId: saved.orderId,
        tableId: table.id,
      });
    }
  }
  return { id: saved.orderId, status: approval ? "PENDING_APPROVAL" : "OPEN", created: true };
}

function replayOf(
  existing: { id: string; status: string; tableSession: { tableId: string } | null },
  tableId: string,
): GuestOrderResult {
  if (existing.tableSession?.tableId !== tableId) {
    throw new AppError(409, "CLIENT_ID_REUSED", "This order was already placed elsewhere.");
  }
  return {
    id: existing.id,
    status: existing.status === "PENDING_APPROVAL" ? "PENDING_APPROVAL" : "OPEN",
    created: false,
  };
}

const addOnNames = (json: unknown): string[] =>
  Array.isArray(json)
    ? json.flatMap((a: unknown) =>
        a && typeof a === "object" && "name" in a && typeof a.name === "string" ? [a.name] : [],
      )
    : [];

/** This sitting's guest orders (open session only — the next party never sees them). */
export async function tableOrders(
  { db, entitlements }: GuestDeps,
  table: PublicTable,
): Promise<TableOrders> {
  const [outlet, session] = await Promise.all([
    db.outlet.findUnique({ where: { id: table.outletId }, select: { orderingMode: true } }),
    db.tableSession.findFirst({
      where: { tableId: table.id, closedAt: null },
      orderBy: { openedAt: "desc" },
      select: { id: true },
    }),
  ]);
  const orderingMode = await effectiveOrderingMode(
    entitlements,
    table.outletId,
    outlet?.orderingMode ?? "VIEW_ONLY",
  );
  if (!session) return { orderingMode, orders: [] };
  const orders = await db.order.findMany({
    where: { tableSessionId: session.id, source: "CUSTOMER" },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: {
      id: true,
      status: true,
      createdAt: true,
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          nameSnapshot: true,
          quantity: true,
          addOns: true,
          status: true,
          voidReason: true,
        },
      },
    },
  });
  return {
    orderingMode,
    orders: orders.map((o) => {
      const reason = o.items.find((i) => i.voidReason)?.voidReason ?? null;
      return {
        id: o.id,
        createdAt: o.createdAt.toISOString(),
        state:
          o.status === "PENDING_APPROVAL"
            ? "WAITING"
            : o.status === "CANCELLED"
              ? "NOT_ACCEPTED"
              : "SENT",
        reason: o.status === "CANCELLED" && reason !== NOT_ACCEPTED ? reason : null,
        // A sent order shows what's still coming (staff voids drop out); a turned-down one, all.
        items: o.items
          .filter((i) => o.status === "CANCELLED" || i.status !== "VOIDED")
          .map((i) => ({
            name: i.nameSnapshot,
            quantity: i.quantity,
            addOns: addOnNames(i.addOns),
          })),
      };
    }),
  };
}
