import type { Device, PairingCodeResponse } from "@restoos/shared";
import { AppError, notFound } from "../../lib/errors";
import type { StaffAuth } from "../../lib/staff-auth";
import type { TenantContext, TenantDb } from "../../lib/tenant";

// Devices (M1-T6): the owner/manager registers restaurant devices and pairs them with a one-time
// code. Tenant-scoped reads/writes here; the credential work is the bound staffAuth service.

export type DeviceDeps = { db: TenantDb; ctx: TenantContext; staffAuth: StaffAuth };

/** Invoice device codes in order: D1…D9, E1…E9, … Z9 (2 chars, plan §5.2). */
export const DEVICE_CODES = [..."DEFGHJKLMNPQRSTUVWXYZ"].flatMap((l) =>
  [..."123456789"].map((d) => `${l}${d}`),
);

const select = {
  id: true,
  code: true,
  label: true,
  isStation: true,
  lastSeenAt: true,
  deviceSecretHash: true,
};
type Row = {
  id: string;
  code: string;
  label: string;
  isStation: boolean;
  lastSeenAt: Date | null;
  deviceSecretHash: string;
};

function outletId(ctx: TenantContext): string {
  if (!ctx.outletId) throw new AppError(400, "OUTLET_REQUIRED", "Choose an outlet first");
  return ctx.outletId;
}

const toDevice = (staffAuth: StaffAuth, d: Row): Device => ({
  id: d.id,
  code: d.code,
  label: d.label,
  isStation: d.isStation,
  paired: staffAuth.isPaired(d.deviceSecretHash),
  lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
});

export async function listDevices({ db, ctx, staffAuth }: DeviceDeps): Promise<Device[]> {
  outletId(ctx);
  const rows = await db.device.findMany({ select, orderBy: { createdAt: "asc" } });
  return rows.map((d) => toDevice(staffAuth, d));
}

async function withCode(staffAuth: StaffAuth, row: Row): Promise<PairingCodeResponse> {
  const { code, expiresAt } = await staffAuth.issuePairingCode(row.id);
  return {
    device: toDevice(staffAuth, row),
    pairingCode: code,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function registerDevice(
  deps: DeviceDeps,
  input: { label: string; isStation: boolean },
): Promise<PairingCodeResponse> {
  const outlet = outletId(deps.ctx);
  // Two owners adding at once can pick the same code; the unique (outletId, code) index
  // rejects one, so retry with the next free code.
  for (let attempt = 0; attempt < 3; attempt++) {
    const used = new Set(
      (await deps.db.device.findMany({ select: { code: true } })).map((d) => d.code),
    );
    const code = DEVICE_CODES.find((c) => !used.has(c));
    if (!code)
      throw new AppError(409, "DEVICE_LIMIT", "This outlet has no free device codes left.");
    try {
      const row = await deps.db.device.create({
        data: {
          organizationId: deps.ctx.organizationId,
          outletId: outlet,
          code,
          label: input.label,
          isStation: input.isStation,
          deviceSecretHash: "unpaired",
        },
        select,
      });
      return await withCode(deps.staffAuth, row);
    } catch (err) {
      if (err instanceof Error && "code" in err && err.code === "P2002") continue;
      throw err;
    }
  }
  throw new AppError(409, "CONFLICT", "Couldn't add the device. Try again.");
}

async function find(db: TenantDb, id: string): Promise<Row> {
  const row = await db.device.findUnique({ where: { id }, select });
  if (!row) throw notFound("Device");
  return row;
}

export async function newPairingCode(deps: DeviceDeps, id: string): Promise<PairingCodeResponse> {
  return withCode(deps.staffAuth, await find(deps.db, id));
}

export async function unpairDevice(deps: DeviceDeps, id: string): Promise<Device> {
  await find(deps.db, id); // tenant check: another restaurant's device is "not found"
  await deps.staffAuth.unpair(id);
  return toDevice(deps.staffAuth, await find(deps.db, id));
}
