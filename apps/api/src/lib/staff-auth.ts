import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { verify } from "@node-rs/argon2";
import type { PrismaClient, StaffRole } from "@restoos/db";
import {
  PAIRING_CODE_DIGITS,
  PAIRING_CODE_TTL_MINUTES,
  PIN_LOCK_MINUTES,
  PIN_MAX_ATTEMPTS,
} from "@restoos/shared";
import { createAudit } from "./audit";
import { AppError } from "./errors";
import type { Redis } from "./redis";
import { carryOverAssignments } from "./assignments";
import { ensureShift, openShift } from "./shifts";
import { createTenantDbFactory, type TenantContext } from "./tenant";

// Staff auth (M1-T6, plan §6.3). Pre-tenant like identity.ts, so it uses the raw client; route
// modules get this bound service, never the client (rule 3).
//
// - Pairing: one-time 8-digit code in Redis (SHA-256 key, 10 min) → device cookie
//   `<deviceId>.<secret>`; only SHA-256(secret) is stored (high-entropy, so no slow hash needed).
//   Redeeming rotates the secret, so a device can't be paired in two browsers.
// - Staff sign-in: tap name + PIN (argon2) → StaffSession token cookie (SHA-256 stored), 14 h,
//   bound to the device: the session only works together with that device's cookie.
// - Lockout: 5 wrong PINs per device in 5 minutes.

export const DEVICE_COOKIE = "restoos_device";
export const STAFF_COOKIE = "restoos_staff";
export const DEVICE_COOKIE_MAX_AGE_S = 365 * 24 * 3600;
export const STAFF_SESSION_HOURS = 14;
const DEFAULT_PAIR_ATTEMPTS_PER_MINUTE = 10;
/** Stored when a device is unpaired: never equals a SHA-256 hex digest. */
const UNPAIRED = "unpaired";

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const token = () => randomBytes(32).toString("base64url");

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const keys = {
  code: (code: string) => `pair:code:${sha256(code)}`,
  device: (deviceId: string) => `pair:device:${deviceId}`,
  pinFails: (deviceId: string) => `pin:fail:${deviceId}`,
};

export type AuthedDevice = {
  id: string;
  organizationId: string;
  outletId: string;
  label: string;
  outletName: string;
  /** Outlet settings the staff area needs (M1-T7). */
  timeZone: string;
  autoStartShift: boolean;
};

export type StaffIdentity = {
  session: { id: string; expiresAt: Date };
  device: AuthedDevice;
  employee: { id: string; name: string; role: StaffRole };
};

export type StaffAuth = ReturnType<typeof createStaffAuth>;

export function createStaffAuth({
  prisma,
  redis,
  pairAttemptsPerMinute = DEFAULT_PAIR_ATTEMPTS_PER_MINUTE,
  log = () => undefined,
}: {
  prisma: PrismaClient;
  redis: Redis;
  /** Guessing guard for pairing codes (env PAIR_ATTEMPTS_PER_IP_PER_MINUTE; E2E raises it). */
  pairAttemptsPerMinute?: number;
  /** Security events (lockouts) for the app log; they're also written to the audit log. */
  log?: (event: string, data: Record<string, unknown>) => void;
}) {
  const ttl = PAIRING_CODE_TTL_MINUTES * 60;

  async function revokePairingCode(deviceId: string): Promise<void> {
    const previous = await redis.get(keys.device(deviceId));
    if (previous) await redis.del(`pair:code:${previous}`, keys.device(deviceId));
  }

  async function authenticateDevice(cookie: string | undefined): Promise<AuthedDevice | null> {
    if (!cookie) return null;
    const dot = cookie.indexOf(".");
    if (dot <= 0) return null;
    const id = cookie.slice(0, dot);
    const secret = cookie.slice(dot + 1);
    const device = await prisma.device.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        outletId: true,
        label: true,
        deviceSecretHash: true,
        outlet: { select: { name: true, timezone: true, autoStartShift: true } },
      },
    });
    if (!device || !sameHash(device.deviceSecretHash, sha256(secret))) return null;
    return {
      id: device.id,
      organizationId: device.organizationId,
      outletId: device.outletId,
      label: device.label,
      outletName: device.outlet.name,
      timeZone: device.outlet.timezone,
      autoStartShift: device.outlet.autoStartShift,
    };
  }

  // Audit + shifts go through the tenant client, scoped to the device's restaurant.
  const getTenantDb = createTenantDbFactory(prisma);
  const audit = createAudit(getTenantDb);
  const systemCtx = (d: AuthedDevice, reason: string): TenantContext => ({
    organizationId: d.organizationId,
    outletId: d.outletId,
    actor: { kind: "system", reason },
  });
  const staffCtx = (d: AuthedDevice, e: { id: string; role: StaffRole }): TenantContext => ({
    organizationId: d.organizationId,
    outletId: d.outletId,
    actor: { kind: "staff", employeeId: e.id, role: e.role },
  });

  /** Opens today's shift (closing a forgotten one) and records both in the audit log. */
  async function startShift(d: AuthedDevice, e: { id: string; role: StaffRole }, auto: boolean) {
    const ctx = staffCtx(d, e);
    const result = await ensureShift(getTenantDb(ctx), {
      organizationId: d.organizationId,
      outletId: d.outletId,
      employeeId: e.id,
      timeZone: d.timeZone,
    });
    if (result.autoClosed) {
      await audit(ctx, "shift.autoClosed", "Shift", result.autoClosed.id, {
        endedAt: result.autoClosed.endedAt.toISOString(),
      });
    }
    if (result.started) {
      await audit(ctx, "shift.start", "Shift", result.shift.id, { auto });
      if (e.role === "BUTLER") {
        // Yesterday's tables by default (M3-T3). Best effort: never blocks signing in (rule 5).
        await carryOverAssignments(getTenantDb(ctx), ctx, e.id, result.shift.id).catch(
          (err: unknown) =>
            log("assignment.carry_over_failed", { employeeId: e.id, err: String(err) }),
        );
      }
    }
    return result.shift;
  }

  return {
    authenticateDevice,

    /** New one-time code for a device; any earlier unused code stops working. */
    async issuePairingCode(deviceId: string): Promise<{ code: string; expiresAt: Date }> {
      await revokePairingCode(deviceId);
      for (;;) {
        const code = String(randomInt(0, 10 ** PAIRING_CODE_DIGITS)).padStart(
          PAIRING_CODE_DIGITS,
          "0",
        );
        // NX: never hand out a code that's live for another device.
        if (await redis.set(keys.code(code), deviceId, "EX", ttl, "NX")) {
          await redis.set(keys.device(deviceId), sha256(code), "EX", ttl);
          return { code, expiresAt: new Date(Date.now() + ttl * 1000) };
        }
      }
    },

    /** Guessing guard for the public pairing endpoint: 10 tries per minute per IP by default. */
    async assertPairingAllowed(ip: string): Promise<void> {
      const key = `pair:ip:${ip}`;
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, 60);
      if (n > pairAttemptsPerMinute) {
        throw new AppError(
          429,
          "TOO_MANY_ATTEMPTS",
          "Too many tries. Wait a minute, then try again.",
          {
            retryAfterSeconds: Math.max(1, await redis.ttl(key)),
          },
        );
      }
    },

    /** Redeems a code once → device cookie value. Rotates the secret and ends old sessions. */
    async pair(code: string): Promise<{ cookie: string; device: AuthedDevice } | null> {
      const deviceId = await redis.getdel(keys.code(code));
      if (!deviceId) return null;
      await redis.del(keys.device(deviceId));
      const secret = token();
      await prisma.$transaction([
        prisma.device.update({
          where: { id: deviceId },
          data: { deviceSecretHash: sha256(secret), lastSeenAt: new Date() },
        }),
        prisma.staffSession.deleteMany({ where: { deviceId } }),
      ]);
      const cookie = `${deviceId}.${secret}`;
      const device = await authenticateDevice(cookie);
      if (!device) return null;
      await audit(systemCtx(device, "pairing"), "device.paired", "Device", device.id);
      return { cookie, device };
    },

    /** Unpairs: the device cookie stops working and everyone on it is signed out. */
    async unpair(deviceId: string): Promise<void> {
      await revokePairingCode(deviceId);
      await prisma.$transaction([
        prisma.device.update({ where: { id: deviceId }, data: { deviceSecretHash: UNPAIRED } }),
        prisma.staffSession.deleteMany({ where: { deviceId } }),
      ]);
    },

    isPaired: (deviceSecretHash: string) =>
      deviceSecretHash !== UNPAIRED && deviceSecretHash.length === 64,

    /** Active staff of the device's outlet, for the sign-in tiles. */
    listStaff: (device: AuthedDevice) =>
      prisma.employee.findMany({
        where: { outletId: device.outletId, isActive: true },
        select: { id: true, name: true, role: true, pinLength: true },
        orderBy: { name: "asc" },
      }),

    /** PIN sign-in with per-device lockout → staff session cookie value. */
    async login(
      device: AuthedDevice,
      employeeId: string,
      pin: string,
    ): Promise<{ cookie: string; expiresAt: Date }> {
      const failKey = keys.pinFails(device.id);
      const fails = Number((await redis.get(failKey)) ?? 0);
      if (fails >= PIN_MAX_ATTEMPTS) {
        const retryAfterSeconds = Math.max(1, await redis.ttl(failKey));
        throw new AppError(429, "PIN_LOCKED", "Too many wrong PINs on this device.", {
          retryAfterSeconds,
        });
      }

      const employee = await prisma.employee.findFirst({
        where: { id: employeeId, outletId: device.outletId, isActive: true },
        select: { id: true, pinHash: true, role: true },
      });
      const ok = employee ? await verify(employee.pinHash, pin) : false;
      if (!employee || !ok) {
        const count = await redis.incr(failKey);
        if (count === 1) await redis.expire(failKey, PIN_LOCK_MINUTES * 60);
        if (count >= PIN_MAX_ATTEMPTS) {
          log("staff.pin_locked", { deviceId: device.id, employeeId, attempts: count });
          await audit(systemCtx(device, "pin-lockout"), "staff.pinLocked", "Device", device.id, {
            employeeId,
            attempts: count,
          });
          throw new AppError(429, "PIN_LOCKED", "Too many wrong PINs on this device.", {
            retryAfterSeconds: Math.max(1, await redis.ttl(failKey)),
          });
        }
        throw new AppError(401, "WRONG_PIN", "That PIN didn't match. Try again.", {
          attemptsLeft: PIN_MAX_ATTEMPTS - count,
        });
      }

      await redis.del(failKey);
      const value = token();
      const expiresAt = new Date(Date.now() + STAFF_SESSION_HOURS * 3600 * 1000);
      await prisma.$transaction([
        prisma.staffSession.create({
          data: {
            organizationId: device.organizationId,
            employeeId: employee.id,
            deviceId: device.id,
            tokenHash: sha256(value),
            expiresAt,
          },
        }),
        prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } }),
      ]);
      // First sign-in of the day starts the shift (outlet setting, M1-T7). Never blocks sign-in.
      if (device.autoStartShift) {
        try {
          await startShift(device, employee, true);
        } catch (err) {
          log("shift.autostart_failed", { deviceId: device.id, employeeId, err: String(err) });
        }
      }
      return { cookie: value, expiresAt };
    },

    /** The signed-in staff member — only on the device the session was created on. */
    async resolve(
      deviceCookie: string | undefined,
      staffCookie: string | undefined,
    ): Promise<StaffIdentity | null> {
      if (!staffCookie) return null;
      const device = await authenticateDevice(deviceCookie);
      if (!device) return null;
      const session = await prisma.staffSession.findUnique({
        where: { tokenHash: sha256(staffCookie) },
        select: {
          id: true,
          deviceId: true,
          expiresAt: true,
          employee: { select: { id: true, name: true, role: true, isActive: true } },
        },
      });
      if (
        !session ||
        session.deviceId !== device.id ||
        session.expiresAt <= new Date() ||
        !session.employee.isActive
      ) {
        return null;
      }
      const { isActive: _active, ...employee } = session.employee;
      return { session: { id: session.id, expiresAt: session.expiresAt }, device, employee };
    },

    /** The signed-in person's open shift, or null. */
    currentShift: (me: StaffIdentity) =>
      openShift(getTenantDb(staffCtx(me.device, me.employee)), me.employee.id),

    /** "Start Shift" (idempotent: returns the open shift). */
    startShift: (me: StaffIdentity) => startShift(me.device, me.employee, false),

    /** "End Shift": closes the shift and signs this person out of the device. */
    async endShift(me: StaffIdentity, staffCookie: string | undefined): Promise<void> {
      const ctx = staffCtx(me.device, me.employee);
      const db = getTenantDb(ctx);
      const open = await openShift(db, me.employee.id);
      if (open) {
        await db.shift.updateMany({
          where: { employeeId: me.employee.id, endedAt: null },
          data: { endedAt: new Date() },
        });
        await audit(ctx, "shift.end", "Shift", open.id);
      }
      if (staffCookie) {
        await prisma.staffSession.deleteMany({ where: { tokenHash: sha256(staffCookie) } });
      }
    },

    async logout(staffCookie: string | undefined): Promise<void> {
      if (!staffCookie) return;
      await prisma.staffSession.deleteMany({ where: { tokenHash: sha256(staffCookie) } });
    },
  };
}
