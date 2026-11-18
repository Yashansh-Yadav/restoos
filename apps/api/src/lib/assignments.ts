import { copyPlan } from "@restoos/shared";
import type { TenantContext, TenantDb } from "./tenant";

// Table assignments (M3-T3). An assignment belongs to the butler's shift: it is active while
// its own endedAt is null AND the shift is still open, so ending a shift needs no extra hook.

export const activeAssignment = { endedAt: null, shift: { endedAt: null } } as const;

/**
 * "Default to previous day's assignment": when a butler's shift starts, give back the tables
 * they still had when their last shift ended, unless another on-shift butler holds them now.
 * Returns the table ids copied.
 */
export async function carryOverAssignments(
  db: TenantDb,
  ctx: TenantContext,
  employeeId: string,
  shiftId: string,
): Promise<string[]> {
  if (!ctx.outletId) return [];
  const previous = await db.shift.findFirst({
    where: { employeeId, id: { not: shiftId }, endedAt: { not: null } },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  if (!previous) return [];
  const rows = await db.tableAssignment.findMany({
    where: { shiftId: previous.id, endedAt: null },
    select: { tableId: true },
  });
  const ids = rows.map((r) => r.tableId);
  if (ids.length === 0) return [];
  const [existing, taken] = await Promise.all([
    db.diningTable.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    db.tableAssignment.findMany({
      where: { tableId: { in: ids }, ...activeAssignment },
      select: { tableId: true },
    }),
  ]);
  const plan = copyPlan(
    ids,
    new Set(existing.map((t) => t.id)),
    new Set(taken.map((t) => t.tableId)),
  );
  if (plan.length > 0) {
    await db.tableAssignment.createMany({
      data: plan.map((tableId) => ({
        organizationId: ctx.organizationId,
        outletId: ctx.outletId as string, // checked above
        tableId,
        employeeId,
        shiftId,
      })),
    });
  }
  return plan;
}
