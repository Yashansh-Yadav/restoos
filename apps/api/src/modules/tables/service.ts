import {
  isMovable,
  mergedStatus,
  type ManualTableEvent,
  type MovedTable,
  type MoveTableInput,
  type StaffFloor,
  type StaffFloorTable,
} from "@restoos/shared";
import { activeAssignment } from "../../lib/assignments";
import { writeAudit } from "../../lib/audit";
import { AppError, notFound } from "../../lib/errors";
import type { EventBus } from "../../lib/events";
import { setTableStatus, STATUS_WORDS, transitionTable } from "../../lib/tables";
import type { TenantContext, TenantDb } from "../../lib/tenant";

// Staff floor view (M3-T4): every table with its status, who looks after it, and what needs
// attention (a ringing bell, an order waiting for approval). Status changes go through
// transitionTable() (lib/tables.ts), which enforces the state machine.

export type TablesDeps = { db: TenantDb; ctx: TenantContext; events: EventBus };

export async function getStaffFloor({ db, ctx }: TablesDeps): Promise<StaffFloor> {
  if (!ctx.outletId) throw new AppError(400, "OUTLET_REQUIRED", "Choose an outlet first");
  const me = ctx.actor.kind === "staff" ? ctx.actor.employeeId : null;
  const [sections, assignments, sessions, bells, pending, ready] = await Promise.all([
    db.section.findMany({
      select: {
        id: true,
        name: true,
        tables: {
          select: { id: true, label: true, seats: true, posX: true, posY: true, status: true },
          orderBy: [{ posY: "asc" }, { posX: "asc" }],
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.tableAssignment.findMany({
      where: activeAssignment,
      select: { tableId: true, employee: { select: { id: true, name: true } } },
    }),
    db.tableSession.findMany({
      where: { closedAt: null },
      select: { id: true, tableId: true, openedAt: true },
    }),
    db.bellEvent.findMany({
      where: { status: { in: ["NOTIFYING", "ACCEPTED"] } },
      select: { tableId: true },
    }),
    db.order.findMany({
      where: { status: "PENDING_APPROVAL", tableSession: { closedAt: null } },
      select: { tableSession: { select: { tableId: true } } },
    }),
    db.orderItem.findMany({
      where: { status: "READY", order: { tableSession: { closedAt: null } } },
      select: { order: { select: { tableSession: { select: { tableId: true } } } } },
    }),
  ]);

  const holder = new Map(assignments.map((a) => [a.tableId, a.employee]));
  const since = new Map(sessions.map((s) => [s.tableId, s.openedAt.toISOString()]));
  const ringing = new Set(bells.map((b) => b.tableId));
  const readyTables = new Set(
    ready.flatMap((i) => (i.order.tableSession ? [i.order.tableSession.tableId] : [])),
  );
  const waiting = new Set(pending.flatMap((o) => (o.tableSession ? [o.tableSession.tableId] : [])));

  return {
    sections: sections.map((s) => ({
      id: s.id,
      name: s.name,
      tables: s.tables.map((t): StaffFloorTable => ({
        ...t,
        butlerId: holder.get(t.id)?.id ?? null,
        butlerName: holder.get(t.id)?.name ?? null,
        mine: me !== null && holder.get(t.id)?.id === me,
        activeBell: ringing.has(t.id),
        pendingApproval: waiting.has(t.id),
        readyToServe: readyTables.has(t.id),
        since: since.get(t.id) ?? null,
      })),
    })),
  };
}

/** Seat guests, guests left, clear, cleaned — the taps staff make on the floor screen. */
export async function changeStatus(deps: TablesDeps, tableId: string, event: ManualTableEvent) {
  return transitionTable(deps, tableId, event);
}

// ── Move guests / merge tables (M5-T7) ──────────────────────────────────────
// Transfer: the open session itself moves to a free table (its orders, KOTs, waiting guest
// orders and bell history follow it); the old table is freed. Merge: the source session's
// orders and bell history join the target's session; the source session closes and the table
// is freed (user decision: no linked tables). One transaction, both tables guarded on the status
// read, audited inside it (rule 7). Bills arrive in M7, which must refuse a table with a bill.

const openSession = (db: Pick<TenantDb, "tableSession">, tableId: string) =>
  db.tableSession.findFirst({
    where: { tableId, closedAt: null },
    orderBy: { openedAt: "desc" },
    select: { id: true },
  });

export async function moveTable(
  { db, ctx, events }: TablesDeps,
  fromId: string,
  input: MoveTableInput,
): Promise<MovedTable> {
  const outletId = ctx.outletId;
  if (!outletId) throw new AppError(400, "OUTLET_REQUIRED", "Choose an outlet first");
  if (fromId === input.toTableId) {
    throw new AppError(400, "SAME_TABLE", "Choose a different table.");
  }
  const select = { id: true, label: true, status: true } as const;
  const [from, to] = await Promise.all([
    db.diningTable.findFirst({ where: { id: fromId, outletId }, select }),
    db.diningTable.findFirst({ where: { id: input.toTableId, outletId }, select }),
  ]);
  if (!from || !to) throw notFound("Table");
  if (!isMovable(from.status)) {
    throw new AppError(
      409,
      "NOTHING_TO_MOVE",
      `${from.label} is ${STATUS_WORDS[from.status]} — there are no guests to move.`,
    );
  }
  const transfer = input.kind === "transfer";
  if (transfer && to.status !== "FREE") {
    throw new AppError(
      409,
      "TABLE_NOT_FREE",
      `${to.label} is ${STATUS_WORDS[to.status]}. Choose a free table, or join the tables instead.`,
    );
  }
  if (!transfer && !isMovable(to.status)) {
    throw new AppError(
      409,
      "NOTHING_TO_JOIN",
      `${to.label} is ${STATUS_WORDS[to.status]}. Choose a table with guests, or move instead.`,
    );
  }
  const finalStatus = transfer ? from.status : mergedStatus(to.status, from.status);

  await db.$transaction(async (tx) => {
    const source = await openSession(tx, from.id);
    if (!source) {
      throw new AppError(409, "NOTHING_TO_MOVE", `${from.label} has no guests to move.`);
    }
    await setTableStatus(tx, from, "FREE");
    await setTableStatus(tx, to, finalStatus);
    let orders: number;
    let sessionId: string;
    if (transfer) {
      await tx.tableSession.update({ where: { id: source.id }, data: { tableId: to.id } });
      await tx.bellEvent.updateMany({
        where: { tableSessionId: source.id },
        data: { tableId: to.id },
      });
      orders = await tx.order.count({ where: { tableSessionId: source.id } });
      sessionId = source.id;
    } else {
      const target = await openSession(tx, to.id);
      if (!target) {
        throw new AppError(409, "NOTHING_TO_JOIN", `${to.label} has no guests to join.`);
      }
      orders = (
        await tx.order.updateMany({
          where: { tableSessionId: source.id },
          data: { tableSessionId: target.id },
        })
      ).count;
      await tx.bellEvent.updateMany({
        where: { tableSessionId: source.id },
        data: { tableSessionId: target.id, tableId: to.id },
      });
      await tx.tableSession.update({
        where: { id: source.id },
        data: { closedAt: new Date() },
      });
      sessionId = target.id;
    }
    await writeAudit(tx, ctx, transfer ? "table.transfer" : "table.merge", "DiningTable", from.id, {
      from: { id: from.id, label: from.label, status: from.status },
      to: { id: to.id, label: to.label, statusBefore: to.status, statusAfter: finalStatus },
      sessionId,
      mergedSessionId: transfer ? null : source.id,
      orders,
    });
  });

  for (const t of [
    { id: from.id, status: "FREE" as const },
    { id: to.id, status: finalStatus },
  ]) {
    await events.publishEvent(ctx, "table.statusChanged", {
      outletId,
      tableId: t.id,
      status: t.status,
    });
  }
  await events.publishEvent(ctx, "table.moved", {
    outletId,
    fromTableId: from.id,
    toTableId: to.id,
    kind: input.kind,
  });
  return {
    kind: input.kind,
    from: { id: from.id, label: from.label },
    to: { id: to.id, label: to.label, status: finalStatus },
  };
}
