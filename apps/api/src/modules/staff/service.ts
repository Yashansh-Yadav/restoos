import { hash } from "@node-rs/argon2";
import type { Employee, StaffList, StaffRole } from "@restoos/shared";
import type { Entitlements } from "../../lib/entitlements";
import { AppError, forbidden, notFound } from "../../lib/errors";
import type { TenantContext, TenantDb } from "../../lib/tenant";

// Staff management (M1-T5). Pure business logic over the tenant client: every query is already
// scoped to the organisation (and outlet) in ctx, so another tenant's employee is "not found".
// TODO(M4): publishEvent("staff.changed") once events exist (plan §17 proposal #3).

export type StaffDeps = { db: TenantDb; ctx: TenantContext; entitlements: Entitlements };

type EmployeeRow = {
  id: string;
  name: string;
  phone: string | null;
  role: StaffRole;
  isActive: boolean;
  createdAt: Date;
};
const select = { id: true, name: true, phone: true, role: true, isActive: true, createdAt: true };
const toEmployee = (e: EmployeeRow): Employee => ({ ...e, createdAt: e.createdAt.toISOString() });

function outletId(ctx: TenantContext): string {
  if (!ctx.outletId) throw new AppError(400, "OUTLET_REQUIRED", "Choose an outlet first");
  return ctx.outletId;
}

/** Managers look after cashiers, butlers and kitchen staff; only the owner/admin manages managers. */
function assertCanManage(ctx: TenantContext, ...roles: (StaffRole | undefined)[]): void {
  if (ctx.actor.kind === "staff" && ctx.actor.role === "MANAGER" && roles.includes("MANAGER")) {
    throw forbidden("Only the owner can add or change managers");
  }
}

async function limitFor({ db, ctx, entitlements }: StaffDeps) {
  const outlet = outletId(ctx);
  const [used, max] = await Promise.all([
    db.employee.count({ where: { isActive: true } }),
    entitlements.getLimit(outlet, "MAX_STAFF"),
  ]);
  return { used, max };
}

async function assertRoomForOneMore(deps: StaffDeps): Promise<void> {
  const { used, max } = await limitFor(deps);
  if (used >= max) {
    throw new AppError(
      403,
      "STAFF_LIMIT_REACHED",
      `Your plan allows ${max} active staff. Deactivate someone or upgrade your plan.`,
    );
  }
}

/** Revokes every staff session of this employee (signed out on all devices). */
const revokeSessions = (db: TenantDb, employeeId: string) =>
  db.staffSession.deleteMany({ where: { employeeId } });

export async function listStaff(deps: StaffDeps): Promise<StaffList> {
  outletId(deps.ctx);
  const [rows, { used, max }] = await Promise.all([
    deps.db.employee.findMany({ select, orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    limitFor(deps),
  ]);
  return {
    employees: rows.map(toEmployee),
    limit: { used, max: Number.isFinite(max) ? max : null },
  };
}

export async function createEmployee(
  deps: StaffDeps,
  input: { name: string; phone?: string | null; role: StaffRole; pin: string },
): Promise<Employee> {
  assertCanManage(deps.ctx, input.role);
  await assertRoomForOneMore(deps);
  const row = await deps.db.employee.create({
    data: {
      organizationId: deps.ctx.organizationId,
      outletId: outletId(deps.ctx),
      name: input.name,
      phone: input.phone ?? null,
      role: input.role,
      pinHash: await hash(input.pin),
      pinLength: input.pin.length,
    },
    select,
  });
  return toEmployee(row);
}

export async function updateEmployee(
  deps: StaffDeps,
  id: string,
  input: { name?: string; phone?: string | null; role?: StaffRole; isActive?: boolean },
): Promise<Employee> {
  const current = await deps.db.employee.findUnique({ where: { id }, select });
  if (!current) throw notFound("Staff member");
  assertCanManage(deps.ctx, current.role, input.role);
  if (input.isActive === true && !current.isActive) await assertRoomForOneMore(deps);

  const row = await deps.db.employee.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.role !== undefined && { role: input.role }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    select,
  });
  if (input.isActive === false) await revokeSessions(deps.db, id);
  return toEmployee(row);
}

export async function setPin(deps: StaffDeps, id: string, pin: string): Promise<void> {
  const current = await deps.db.employee.findUnique({ where: { id }, select: { role: true } });
  if (!current) throw notFound("Staff member");
  assertCanManage(deps.ctx, current.role);
  await deps.db.employee.update({
    where: { id },
    data: { pinHash: await hash(pin), pinLength: pin.length },
  });
  await revokeSessions(deps.db, id);
}
