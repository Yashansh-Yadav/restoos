import { AppError } from "./errors";
import { businessDateOf } from "./shifts";
import type { TenantContext, TenantDb } from "./tenant";

// Kitchen tickets (M5-T2, plan §5.5). createKotForOrder() turns an order's NEW items into one
// KOT with the outlet's next daily number and marks them SENT. Runs inside the caller's
// transaction (sending an order; later approving a customer order, M5-T6). Database only — no
// Redis, no plan checks — so it never blocks the kitchen (rule 5).

/** The parts of a (tenant) transaction client a KOT needs. */
export type KotTx = Pick<TenantDb, "outlet" | "orderItem" | "kot" | "kotCounter">;

export type CreatedKot = { id: string; number: number; businessDate: string; itemCount: number };

/**
 * Next KOT number for the outlet's business day. Concurrent sends queue on the counter row's
 * lock, so numbers never repeat and never need a retry.
 */
export async function nextKotNumber(
  tx: Pick<KotTx, "kotCounter">,
  ctx: TenantContext,
  businessDate: string,
): Promise<number> {
  const outletId = ctx.outletId;
  if (!outletId) throw new AppError(400, "OUTLET_REQUIRED", "Choose an outlet first");
  // 1. Make sure today's row exists: INSERT … ON CONFLICT DO NOTHING never errors when several
  //    sends create it at once (an upsert's insert could, and that would abort the transaction).
  await tx.kotCounter.createMany({
    data: [{ organizationId: ctx.organizationId, outletId, businessDate, last: 0 }],
    skipDuplicates: true,
  });
  // 2. Bump it: a single UPDATE … SET last = last + 1; concurrent sends wait on the row lock.
  const row = await tx.kotCounter.update({
    where: { outletId_businessDate: { outletId, businessDate } },
    data: { last: { increment: 1 } },
    select: { last: true },
  });
  return row.last;
}

/** One KOT for the order's NEW items (none → no KOT). */
export async function createKotForOrder(
  tx: KotTx,
  ctx: TenantContext,
  orderId: string,
  now: Date = new Date(),
): Promise<CreatedKot | null> {
  const outletId = ctx.outletId;
  if (!outletId) throw new AppError(400, "OUTLET_REQUIRED", "Choose an outlet first");
  const items = await tx.orderItem.findMany({
    where: { orderId, status: "NEW", kotId: null },
    select: { id: true },
  });
  if (items.length === 0) return null;

  const outlet = await tx.outlet.findUnique({
    where: { id: outletId },
    select: { timezone: true },
  });
  const businessDate = businessDateOf(now, outlet?.timezone ?? "Asia/Kolkata");
  const number = await nextKotNumber(tx, ctx, businessDate);
  const kot = await tx.kot.create({
    data: { organizationId: ctx.organizationId, outletId, orderId, number, businessDate },
    select: { id: true },
  });
  await tx.orderItem.updateMany({
    where: { id: { in: items.map((i) => i.id) } },
    data: { kotId: kot.id, status: "SENT" },
  });
  return { id: kot.id, number, businessDate, itemCount: items.length };
}
