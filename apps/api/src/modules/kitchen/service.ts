import {
  isKotStep,
  kotStage,
  STAGE_ITEM_STATUS,
  type KitchenBoard,
  type KotStage,
} from "@restoos/shared";
import { AppError, notFound } from "../../lib/errors";
import type { EventBus } from "../../lib/events";
import type { TenantContext, TenantDb } from "../../lib/tenant";

// Kitchen display (M5-T3). The board lists every ticket that still has something to cook or
// hand over (any day — a ticket from before midnight isn't dropped), oldest first. A ticket's
// stage comes from its items (kotStage); the kitchen moves a whole ticket one step at a time.

export type KitchenDeps = { db: TenantDb; ctx: TenantContext; events: EventBus };

const ACTIVE = ["SENT", "PREPARING", "READY"] as const;

function outletId(ctx: TenantContext): string {
  if (!ctx.outletId) throw new AppError(400, "OUTLET_REQUIRED", "Choose an outlet first");
  return ctx.outletId;
}

const addOnNames = (json: unknown): string[] =>
  Array.isArray(json)
    ? json.flatMap((a: unknown) =>
        a && typeof a === "object" && "name" in a && typeof a.name === "string" ? [a.name] : [],
      )
    : [];

export async function getBoard({ db, ctx }: KitchenDeps): Promise<KitchenBoard> {
  const outlet = outletId(ctx);
  const [settings, kots] = await Promise.all([
    db.outlet.findUnique({ where: { id: outlet }, select: { kotLateMinutes: true } }),
    db.kot.findMany({
      where: { items: { some: { status: { in: [...ACTIVE] } } } },
      orderBy: [{ createdAt: "asc" }, { number: "asc" }],
      take: 200,
      select: {
        id: true,
        number: true,
        createdAt: true,
        order: { select: { tableSession: { select: { table: { select: { label: true } } } } } },
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            nameSnapshot: true,
            quantity: true,
            addOns: true,
            note: true,
            status: true,
          },
        },
      },
    }),
  ]);
  return {
    lateAfterMinutes: settings?.kotLateMinutes ?? 15,
    kots: kots.flatMap((k) => {
      const stage = kotStage(k.items.map((i) => i.status));
      if (!stage) return [];
      return [
        {
          id: k.id,
          number: k.number,
          createdAt: k.createdAt.toISOString(),
          tableLabel: k.order.tableSession?.table.label ?? null,
          stage,
          items: k.items.map((i) => ({
            id: i.id,
            name: i.nameSnapshot,
            quantity: i.quantity,
            addOns: addOnNames(i.addOns),
            note: i.note,
            status: i.status,
          })),
        },
      ];
    }),
  };
}

/** Move a whole ticket one step (forward, or back to undo). */
export async function moveKot(
  deps: KitchenDeps,
  kotId: string,
  to: KotStage,
): Promise<{ id: string; number: number; stage: KotStage }> {
  const { db, ctx, events } = deps;
  const outlet = outletId(ctx);
  const kot = await db.kot.findUnique({
    where: { id: kotId },
    select: {
      id: true,
      number: true,
      order: { select: { tableSession: { select: { tableId: true } } } },
      items: { select: { status: true } },
    },
  });
  if (!kot) throw notFound("Kitchen ticket");
  const from = kotStage(kot.items.map((i) => i.status));
  if (!from) {
    throw new AppError(409, "KOT_DONE", `KOT #${kot.number} has already been served.`);
  }
  if (!isKotStep(from, to)) {
    throw new AppError(
      409,
      "INVALID_KOT_STEP",
      `KOT #${kot.number} is ${from.toLowerCase()} — it can't go straight to ${to.toLowerCase()}.`,
      { stage: from },
    );
  }
  const target = STAGE_ITEM_STATUS[to];
  // Only the ticket's active items move; voided and served ones stay as they are.
  await db.orderItem.updateMany({
    where: { kotId, status: { in: ACTIVE.filter((s) => s !== target) } },
    data: { status: target },
  });
  const tableId = kot.order.tableSession?.tableId ?? null;
  await events.publishEvent(ctx, "kot.itemStatusChanged", {
    outletId: outlet,
    kotId,
    tableId,
    stage: to,
  });
  return { id: kot.id, number: kot.number, stage: to };
}
