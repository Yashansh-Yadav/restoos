import type { Prisma } from "@restoos/db";
import type { AuditAction } from "@restoos/shared";
import type { GetTenantDb, TenantContext, TenantDb } from "./tenant";

// audit() — append-only record of sensitive actions (CLAUDE.md rule 7, M1-T7).
// Writes through the tenant client, so the organisation/outlet come from ctx and the row can
// never land in another tenant; the tenant client also refuses to update or delete audit rows.
// For actions that must be atomic with their change (bill cancel, void…), pass the transaction
// client: `await writeAudit(tx, ctx, …)` inside `db.$transaction`.

const actorOf = (ctx: TenantContext) => {
  switch (ctx.actor.kind) {
    case "owner":
      return { actorType: "OWNER", actorId: ctx.actor.userId };
    case "staff":
      return { actorType: "EMPLOYEE", actorId: ctx.actor.employeeId };
    case "system":
      return { actorType: "SYSTEM", actorId: null };
  }
};

/** Database-level writer: use with a tenant client or a transaction from one. */
export async function writeAudit(
  db: Pick<TenantDb, "auditLog">,
  ctx: TenantContext,
  action: AuditAction,
  entity: string,
  entityId: string,
  data?: Prisma.InputJsonValue,
): Promise<void> {
  await db.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      outletId: ctx.outletId ?? null,
      ...actorOf(ctx),
      action,
      entity,
      entityId,
      ...(data === undefined ? {} : { data }),
    },
  });
}

export type Audit = (
  ctx: TenantContext,
  action: AuditAction,
  entity: string,
  entityId: string,
  data?: Prisma.InputJsonValue,
) => Promise<void>;

/** `audit(ctx, action, entity, id, data)` — the helper routes and services call. */
export function createAudit(getTenantDb: GetTenantDb): Audit {
  return (ctx, action, entity, entityId, data) =>
    writeAudit(getTenantDb(ctx), ctx, action, entity, entityId, data);
}
