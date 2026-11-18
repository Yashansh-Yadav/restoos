import type { ManualTableEvent, StaffFloor, StaffFloorTable } from "@restoos/shared";
import { activeAssignment } from "../../lib/assignments";
import { AppError } from "../../lib/errors";
import type { EventBus } from "../../lib/events";
import { transitionTable } from "../../lib/tables";
import type { TenantContext, TenantDb } from "../../lib/tenant";

// Staff floor view (M3-T4): every table with its status, who looks after it, and what needs
// attention (a ringing bell, an order waiting for approval). Status changes go through
// transitionTable() (lib/tables.ts), which enforces the state machine.

export type TablesDeps = { db: TenantDb; ctx: TenantContext; events: EventBus };

export async function getStaffFloor({ db, ctx }: TablesDeps): Promise<StaffFloor> {
  if (!ctx.outletId) throw new AppError(400, "OUTLET_REQUIRED", "Choose an outlet first");
  const me = ctx.actor.kind === "staff" ? ctx.actor.employeeId : null;
  const [sections, assignments, sessions, bells, pending] = await Promise.all([
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
  ]);

  const holder = new Map(assignments.map((a) => [a.tableId, a.employee]));
  const since = new Map(sessions.map((s) => [s.tableId, s.openedAt.toISOString()]));
  const ringing = new Set(bells.map((b) => b.tableId));
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
        since: since.get(t.id) ?? null,
      })),
    })),
  };
}

/** Seat guests, guests left, clear, cleaned — the taps staff make on the floor screen. */
export async function changeStatus(deps: TablesDeps, tableId: string, event: ManualTableEvent) {
  return transitionTable(deps, tableId, event);
}
