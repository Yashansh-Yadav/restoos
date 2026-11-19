import {
  lineName,
  selectionError,
  unitPriceOf,
  type CreatedOrder,
  type createOrderSchema,
  type OrderPad,
  type PadAddOnGroup,
  type PadItem,
} from "@restoos/shared";
import type { z } from "zod";
import { activeAssignment } from "../../lib/assignments";
import { AppError, notFound } from "../../lib/errors";
import { createKotForOrder, type CreatedKot } from "../../lib/kots";
import type { EventBus } from "../../lib/events";
import { applyTableTransition, publishTableStatus } from "../../lib/tables";
import type { TenantContext, TenantDb } from "../../lib/tenant";

// Staff ordering (M5-T1). The order pad gives the butler everything for one table; a send is
// re-priced here from the database (the client's prices are never trusted), snapshotted onto
// OrderItems, and saved in one transaction with the table's state change (first send seats a
// free table). Idempotent on clientId (rule 8). Each send is one Order and one KOT (M5-T2), all
// committed together.

export type OrderDeps = { db: TenantDb; ctx: TenantContext; events: EventBus };
type CreateOrderInput = z.output<typeof createOrderSchema>;

const TOP_ITEMS = 12;
const TOP_WINDOW_DAYS = 30;

function outletId(ctx: TenantContext): string {
  if (!ctx.outletId) throw new AppError(400, "OUTLET_REQUIRED", "Choose an outlet first");
  return ctx.outletId;
}

/** Visible menu with codes, sizes, add-on groups and tax rates — what the staff pad needs. */
async function staffMenu(db: TenantDb) {
  const [categories, groups] = await Promise.all([
    db.menuCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        items: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: {
            id: true,
            code: true,
            name: true,
            dietType: true,
            basePrice: true,
            taxRateBps: true,
            inStock: true,
            variants: {
              orderBy: [{ sortOrder: "asc" }, { price: "asc" }],
              select: { id: true, name: true, price: true },
            },
            addOnGroups: { select: { groupId: true } },
          },
        },
      },
    }),
    db.addOnGroup.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        minSelect: true,
        maxSelect: true,
        addOns: { orderBy: { name: "asc" }, select: { id: true, name: true, price: true } },
      },
    }),
  ]);
  const shaped = categories
    .map((c) => ({
      id: c.id,
      name: c.name,
      items: c.items.map((i): PadItem => ({
        id: i.id,
        code: i.code,
        name: i.name,
        dietType: i.dietType,
        basePrice: i.basePrice,
        taxRateBps: i.taxRateBps,
        inStock: i.inStock,
        variants: i.variants,
        addOnGroupIds: i.addOnGroups.map((g) => g.groupId),
      })),
    }))
    .filter((c) => c.items.length > 0);
  const used = new Set(shaped.flatMap((c) => c.items.flatMap((i) => i.addOnGroupIds)));
  return { categories: shaped, addOnGroups: groups.filter((g) => used.has(g.id)) };
}

export async function getOrderPad({ db, ctx }: OrderDeps, tableId: string): Promise<OrderPad> {
  const outlet = outletId(ctx);
  const table = await db.diningTable.findUnique({
    where: { id: tableId },
    select: { id: true, label: true, status: true },
  });
  if (!table) throw notFound("Table");

  const since = new Date(Date.now() - TOP_WINDOW_DAYS * 24 * 3600 * 1000);
  const [settings, menu, holder, session, popular] = await Promise.all([
    db.outlet.findUnique({ where: { id: outlet }, select: { pricesIncludeTax: true } }),
    staffMenu(db),
    db.tableAssignment.findFirst({
      where: { tableId, ...activeAssignment },
      select: { employee: { select: { name: true } } },
    }),
    db.tableSession.findFirst({
      where: { tableId, closedAt: null },
      orderBy: { openedAt: "desc" },
      select: { id: true },
    }),
    db.orderItem.groupBy({
      by: ["itemId"],
      where: { order: { outletId: outlet, createdAt: { gte: since } }, status: { not: "VOIDED" } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: TOP_ITEMS * 2,
    }),
  ]);

  const visible = new Set(menu.categories.flatMap((c) => c.items.map((i) => i.id)));
  const top = popular.map((p) => p.itemId).filter((id) => visible.has(id));
  for (const c of menu.categories) {
    for (const i of c.items) if (top.length < TOP_ITEMS && !top.includes(i.id)) top.push(i.id);
  }

  const sent = session
    ? await db.orderItem.findMany({
        where: { order: { tableSessionId: session.id }, status: { not: "VOIDED" } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          nameSnapshot: true,
          quantity: true,
          unitPrice: true,
          taxRateBps: true,
          note: true,
          addOns: true,
          status: true,
        },
      })
    : [];

  return {
    table: { ...table, butlerName: holder?.employee.name ?? null },
    pricing: { pricesIncludeTax: settings?.pricesIncludeTax ?? false },
    categories: menu.categories,
    addOnGroups: menu.addOnGroups,
    topItemIds: top.slice(0, TOP_ITEMS),
    sent: sent.map((l) => ({
      id: l.id,
      name: l.nameSnapshot,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      taxRateBps: l.taxRateBps,
      note: l.note,
      addOns: addOnNames(l.addOns),
      status: l.status,
    })),
  };
}

type AddOnSnapshot = { addOnId: string; name: string; price: number };
const addOnNames = (json: unknown): string[] =>
  Array.isArray(json)
    ? json.flatMap((a: unknown) =>
        a && typeof a === "object" && "name" in a && typeof a.name === "string" ? [a.name] : [],
      )
    : [];

const isUniqueViolation = (err: unknown) =>
  err instanceof Error && "code" in err && err.code === "P2002";

/** "Send to kitchen": one Order with its items, the table moved on, atomically. */
export async function createOrder(
  deps: OrderDeps,
  input: CreateOrderInput,
): Promise<CreatedOrder & { replay: boolean }> {
  const { db, ctx, events } = deps;
  const outlet = outletId(ctx);

  // Rule 8: the same send again (a retry, an offline resync) changes nothing.
  const existing = await db.order.findUnique({
    where: { clientId: input.clientId },
    select: replaySelect,
  });
  if (existing) return replayOf(existing, input.tableId);

  // Re-price from the database. Unknown (or another restaurant's) items are "not found".
  const itemIds = [...new Set(input.items.map((l) => l.itemId))];
  const menuItems = await db.menuItem.findMany({
    where: { id: { in: itemIds } },
    select: {
      id: true,
      name: true,
      basePrice: true,
      taxRateBps: true,
      inStock: true,
      isActive: true,
      category: { select: { isActive: true } },
      variants: { select: { id: true, name: true, price: true } },
      addOnGroups: { select: { groupId: true } },
    },
  });
  if (menuItems.length !== itemIds.length) throw notFound("Menu item");
  const byId = new Map(menuItems.map((i) => [i.id, i]));
  const groupIds = [...new Set(menuItems.flatMap((i) => i.addOnGroups.map((g) => g.groupId)))];
  const groups: PadAddOnGroup[] = groupIds.length
    ? await db.addOnGroup.findMany({
        where: { id: { in: groupIds } },
        select: {
          id: true,
          name: true,
          minSelect: true,
          maxSelect: true,
          addOns: { select: { id: true, name: true, price: true } },
        },
      })
    : [];

  const unavailable = menuItems
    .filter((i) => !i.inStock || !i.isActive || !i.category.isActive)
    .map((i) => i.name);
  if (unavailable.length > 0) {
    throw new AppError(
      409,
      "ITEMS_UNAVAILABLE",
      `${unavailable.join(", ")} ${unavailable.length === 1 ? "is" : "are"} not available right now.`,
      { items: unavailable },
    );
  }

  const lines = input.items.map((l) => {
    const m = byId.get(l.itemId);
    if (!m) throw notFound("Menu item"); // checked above; keeps the types honest
    const padItem = { ...m, addOnGroupIds: m.addOnGroups.map((g) => g.groupId) };
    const sel = { variantId: l.variantId ?? null, addOnIds: l.addOnIds };
    const problem = selectionError(padItem, groups, sel);
    if (problem) throw new AppError(400, "INVALID_SELECTION", problem);
    const addOns: AddOnSnapshot[] = groups
      .flatMap((g) => g.addOns)
      .filter((a) => l.addOnIds.includes(a.id))
      .map((a) => ({ addOnId: a.id, name: a.name, price: a.price }));
    return {
      organizationId: ctx.organizationId,
      itemId: m.id,
      variantId: l.variantId ?? null,
      nameSnapshot: lineName(padItem, l.variantId),
      unitPrice: unitPriceOf(padItem, groups, sel),
      taxRateBps: m.taxRateBps,
      quantity: l.quantity,
      note: l.note ?? null,
      addOns,
    };
  });

  let saved: {
    order: { id: string };
    table: Awaited<ReturnType<typeof applyTableTransition>>;
    kot: CreatedKot | null;
  };
  try {
    saved = await db.$transaction(async (tx) => {
      // First send seats a free table (FREE → ORDERED opens the session); later ones keep it.
      const table = await applyTableTransition(tx, ctx, input.tableId, "order");
      const order = await tx.order.create({
        data: {
          organizationId: ctx.organizationId,
          outletId: outlet,
          tableSessionId: table.sessionId,
          source: "STAFF",
          status: "OPEN",
          createdById: ctx.actor.kind === "staff" ? ctx.actor.employeeId : null,
          clientId: input.clientId,
          items: { create: lines },
        },
        select: { id: true },
      });
      // The kitchen ticket for exactly these items, numbered for today (M5-T2).
      const kot = await createKotForOrder(tx, ctx, order.id);
      return { order, table, kot };
    });
  } catch (err) {
    // Two copies of the same send raced: the other one won; answer like a replay.
    if (!isUniqueViolation(err)) throw err;
    const winner = await db.order.findUnique({
      where: { clientId: input.clientId },
      select: replaySelect,
    });
    if (!winner) throw err;
    return replayOf(winner, input.tableId);
  }

  await publishTableStatus(events, ctx, saved.table);
  await events.publishEvent(ctx, "order.created", {
    outletId: outlet,
    orderId: saved.order.id,
    tableId: input.tableId,
  });
  if (saved.kot) {
    await events.publishEvent(ctx, "kot.created", {
      outletId: outlet,
      kotId: saved.kot.id,
      number: saved.kot.number,
      orderId: saved.order.id,
      tableId: input.tableId,
    });
  }
  return {
    id: saved.order.id,
    tableId: input.tableId,
    itemCount: lines.length,
    created: true,
    kot: saved.kot ? { id: saved.kot.id, number: saved.kot.number } : null,
    replay: false,
  };
}

const replaySelect = {
  id: true,
  tableSession: { select: { tableId: true } },
  _count: { select: { items: true } },
  kots: { select: { id: true, number: true }, orderBy: { createdAt: "asc" }, take: 1 },
} as const;

function replayOf(
  existing: {
    id: string;
    tableSession: { tableId: string } | null;
    _count: { items: number };
    kots: { id: string; number: number }[];
  },
  tableId: string,
): CreatedOrder & { replay: boolean } {
  if (existing.tableSession && existing.tableSession.tableId !== tableId) {
    throw new AppError(409, "CLIENT_ID_REUSED", "This send was already used for another table.");
  }
  return {
    id: existing.id,
    tableId,
    itemCount: existing._count.items,
    created: false,
    kot: existing.kots[0] ?? null,
    replay: true,
  };
}
