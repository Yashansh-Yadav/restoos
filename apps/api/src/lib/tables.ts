import {
  canTransition,
  nextTableStatus,
  sessionEffect,
  type TableEvent,
  type TableStatus,
} from "@restoos/shared";
import { AppError, notFound } from "./errors";
import type { EventBus } from "./events";
import type { TenantContext, TenantDb } from "./tenant";

// transitionTable() — the single way a table changes status (plan §5.6, M3-T4). Staff taps
// (seat, guests left, clear, cleaned) and, later, orders (M5), bills and payments (M7) all go
// through here, so the state machine in @restoos/shared is enforced in one place. It also opens
// and closes the TableSession.

const STATUS_WORDS: Record<TableStatus, string> = {
  FREE: "free",
  OCCUPIED: "seated",
  ORDERED: "ordering",
  BILL_REQUESTED: "waiting for the bill",
  PAID: "paid",
  CLEANING: "being cleaned",
};
const EVENT_WORDS: Record<TableEvent, string> = {
  seat: "be seated",
  unseat: "be freed",
  order: "take an order",
  requestBill: "get a bill",
  pay: "be paid",
  clear: "be cleared",
  cleaned: "be marked clean",
};

export type TransitionResult = {
  id: string;
  label: string;
  status: TableStatus;
  sessionId: string | null;
};

export async function transitionTable(
  deps: { db: TenantDb; ctx: TenantContext; events: EventBus },
  tableId: string,
  event: TableEvent,
): Promise<TransitionResult> {
  const { db, ctx, events } = deps;
  const outletId = ctx.outletId;
  if (!outletId) throw new AppError(400, "OUTLET_REQUIRED", "Choose an outlet first");

  const result = await db.$transaction(async (tx) => {
    const table = await tx.diningTable.findUnique({
      where: { id: tableId },
      select: { id: true, label: true, status: true },
    });
    if (!table) throw notFound("Table");
    if (!canTransition(table.status, event)) {
      const reason = `${table.label} is ${STATUS_WORDS[table.status]} — it can't ${EVENT_WORDS[event]}.`;
      throw new AppError(409, "INVALID_TABLE_TRANSITION", reason, {
        status: table.status,
        event,
      });
    }
    const to = nextTableStatus(table.status, event);

    // Guard against two taps at once: only move from the status we read.
    const moved = await tx.diningTable.updateMany({
      where: { id: tableId, status: table.status },
      data: { status: to },
    });
    if (moved.count === 0) {
      throw new AppError(409, "TABLE_CHANGED", `${table.label} just changed. Check it again.`);
    }

    let sessionId: string | null = null;
    const effect = sessionEffect(table.status, event);
    if (effect === "open") {
      // Close anything left open by mistake before starting the new guests' session.
      await tx.tableSession.updateMany({
        where: { tableId, closedAt: null },
        data: { closedAt: new Date() },
      });
      const session = await tx.tableSession.create({
        data: { organizationId: ctx.organizationId, outletId, tableId },
        select: { id: true },
      });
      sessionId = session.id;
    } else if (effect === "close") {
      await tx.tableSession.updateMany({
        where: { tableId, closedAt: null },
        data: { closedAt: new Date() },
      });
    } else {
      const open = await tx.tableSession.findFirst({
        where: { tableId, closedAt: null },
        select: { id: true },
        orderBy: { openedAt: "desc" },
      });
      sessionId = open?.id ?? null;
    }
    return { id: table.id, label: table.label, status: to, sessionId };
  });

  await events.publishEvent(ctx, "table.statusChanged", {
    outletId,
    tableId,
    status: result.status,
  });
  return result;
}
