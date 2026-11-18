import type { AssignmentBoard } from "@restoos/shared";
import { activeAssignment } from "../../lib/assignments";
import { AppError, notFound } from "../../lib/errors";
import type { EventBus } from "../../lib/events";
import type { TenantContext, TenantDb } from "../../lib/tenant";

// Table assignment per shift (M3-T3): tap a butler, then tap tables. One butler per table at a
// time — giving a table to someone else moves it. An assignment is tied to the butler's open
// shift (see lib/assignments.ts), so only on-shift butlers can be given tables.

export type AssignmentDeps = { db: TenantDb; ctx: TenantContext; events: EventBus };

function outletId(ctx: TenantContext): string {
  if (!ctx.outletId) throw new AppError(400, "OUTLET_REQUIRED", "Choose an outlet first");
  return ctx.outletId;
}

const changed = (deps: AssignmentDeps) =>
  deps.events.publishEvent(deps.ctx, "assignment.changed", { outletId: outletId(deps.ctx) });

// ── Read ────────────────────────────────────────────────────────────────────

export async function getBoard({ db, ctx }: AssignmentDeps): Promise<AssignmentBoard> {
  outletId(ctx);
  const [employees, active, sections] = await Promise.all([
    db.employee.findMany({
      where: { role: "BUTLER", isActive: true },
      select: {
        id: true,
        name: true,
        shifts: {
          orderBy: { startedAt: "desc" },
          take: 1,
          select: { id: true, endedAt: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    db.tableAssignment.findMany({
      where: activeAssignment,
      select: { tableId: true, employeeId: true },
    }),
    db.section.findMany({
      select: {
        id: true,
        name: true,
        tables: {
          select: { id: true, label: true, seats: true, posX: true, posY: true },
          orderBy: [{ posY: "asc" }, { posX: "asc" }],
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const holder = new Map(active.map((a) => [a.tableId, a.employeeId]));
  // Off shift: what they had when their last shift ended (it comes back when they start).
  const lastEnded = employees.flatMap((e) => {
    const last = e.shifts[0];
    return last?.endedAt ? [last.id] : [];
  });
  const usualRows = lastEnded.length
    ? await db.tableAssignment.findMany({
        where: { shiftId: { in: lastEnded }, endedAt: null },
        select: { tableId: true, employeeId: true },
      })
    : [];

  return {
    butlers: employees.map((e) => {
      const onShift = e.shifts[0] !== undefined && e.shifts[0].endedAt === null;
      return {
        id: e.id,
        name: e.name,
        onShift,
        tableIds: active.filter((a) => a.employeeId === e.id).map((a) => a.tableId),
        usualTableIds: onShift
          ? []
          : usualRows.filter((r) => r.employeeId === e.id).map((r) => r.tableId),
      };
    }),
    sections: sections.map((s) => ({
      ...s,
      tables: s.tables.map((t) => ({ ...t, butlerId: holder.get(t.id) ?? null })),
    })),
  };
}

// ── Writes ──────────────────────────────────────────────────────────────────

/** The butler and their open shift, or a clear error. */
async function onShiftButler(db: TenantDb, employeeId: string) {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      name: true,
      role: true,
      isActive: true,
      shifts: {
        where: { endedAt: null },
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { id: true },
      },
    },
  });
  if (!employee || !employee.isActive) throw notFound("Staff member");
  if (employee.role !== "BUTLER") {
    throw new AppError(400, "NOT_A_BUTLER", "Only butlers can be given tables.");
  }
  const shift = employee.shifts[0];
  if (!shift) {
    throw new AppError(
      409,
      "NOT_ON_SHIFT",
      `${employee.name} hasn't started a shift yet. Tables can be given once they sign in.`,
    );
  }
  return { employeeId: employee.id, shiftId: shift.id };
}

/** Give tables to one butler: ends anyone else's hold on them, adds the missing ones. */
async function giveTables(
  deps: AssignmentDeps,
  tableIds: string[],
  to: { employeeId: string; shiftId: string },
) {
  const { db, ctx } = deps;
  const outlet = outletId(ctx);
  await db.$transaction(async (tx) => {
    const now = new Date();
    await tx.tableAssignment.updateMany({
      where: { tableId: { in: tableIds }, ...activeAssignment, NOT: { shiftId: to.shiftId } },
      data: { endedAt: now },
    });
    const mine = await tx.tableAssignment.findMany({
      where: { tableId: { in: tableIds }, shiftId: to.shiftId, endedAt: null },
      select: { tableId: true },
    });
    const have = new Set(mine.map((m) => m.tableId));
    const missing = tableIds.filter((id) => !have.has(id));
    if (missing.length > 0) {
      await tx.tableAssignment.createMany({
        data: missing.map((tableId) => ({
          organizationId: ctx.organizationId,
          outletId: outlet,
          tableId,
          employeeId: to.employeeId,
          shiftId: to.shiftId,
        })),
      });
    }
  });
}

/** Assign (or move) one table; `null` takes it off whoever has it. Idempotent. */
export async function assignTable(
  deps: AssignmentDeps,
  tableId: string,
  employeeId: string | null,
): Promise<void> {
  const { db } = deps;
  if (!(await db.diningTable.findUnique({ where: { id: tableId }, select: { id: true } }))) {
    throw notFound("Table");
  }
  if (employeeId === null) {
    await db.tableAssignment.updateMany({
      where: { tableId, ...activeAssignment },
      data: { endedAt: new Date() },
    });
  } else {
    await giveTables(deps, [tableId], await onShiftButler(db, employeeId));
  }
  await changed(deps);
}

/** "Give all of Main Hall to Rahul": every table in the section, in one go. */
export async function assignSection(
  deps: AssignmentDeps,
  sectionId: string,
  employeeId: string,
): Promise<void> {
  const { db } = deps;
  const section = await db.section.findUnique({
    where: { id: sectionId },
    select: { tables: { select: { id: true } } },
  });
  if (!section) throw notFound("Section");
  const to = await onShiftButler(db, employeeId);
  if (section.tables.length > 0) {
    await giveTables(
      deps,
      section.tables.map((t) => t.id),
      to,
    );
  }
  await changed(deps);
}
