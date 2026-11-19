// M1-T7: shifts start on first sign-in of the day (configurable), Start/End Shift work, forgotten
// shifts auto-close at 14 h, and sensitive actions land in an append-only, tenant-scoped audit log.
import { seedPlans } from "@restoos/db/testing";
import { apiErrorSchema, shiftSchema, staffMeResponseSchema } from "@restoos/shared";
import type { LightMyRequestResponse } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { createTenantDbFactory, TenantViolationError } from "../../lib/tenant";
import { createAuthHarness } from "../../test/auth-harness";
import { browser, restaurant } from "../../test/restaurant";

type Harness = Awaited<ReturnType<typeof createAuthHarness>>;
let h: Harness;

afterEach(async () => {
  await h.close();
});

const code = (res: LightMyRequestResponse) => apiErrorSchema.parse(res.json()).error.code;
const me = async (tablet: ReturnType<typeof browser>) =>
  staffMeResponseSchema.parse((await tablet.call("GET", "/api/staff/me")).json());

async function setup() {
  h = await createAuthHarness();
  await seedPlans(h.prisma);
  const r = await restaurant(h);
  const arjun = await r.addStaff("Arjun", "BUTLER", "3001");
  return { r, arjun };
}

describe("shifts", () => {
  it("starts on the first sign-in of the day and reuses it on the next sign-in", async () => {
    const { r, arjun } = await setup();
    const tablet = await r.signedInTablet(arjun.id, "3001");
    const first = await me(tablet);
    expect(first.autoStartShift).toBe(true);
    expect(first.timeZone).toBe("Asia/Kolkata");
    expect(first.shift).not.toBeNull();

    // Switch User keeps the shift; signing in again the same day reuses it.
    await tablet.call("POST", "/api/staff/logout");
    await tablet.call("POST", "/api/device/login", { employeeId: arjun.id, pin: "3001" });
    expect((await me(tablet)).shift?.id).toBe(first.shift?.id);
    expect(await h.prisma.shift.count()).toBe(1);

    const starts = await h.prisma.auditLog.findMany({ where: { action: "shift.start" } });
    expect(starts).toHaveLength(1);
    expect(starts[0]).toMatchObject({
      organizationId: r.organizationId,
      outletId: r.outletId,
      actorType: "EMPLOYEE",
      actorId: arjun.id,
      entity: "Shift",
      data: { auto: true },
    });
  });

  it("with auto-start off, staff tap Start Shift (idempotent)", async () => {
    const { r, arjun } = await setup();
    const set = await r.owner("PATCH", "/api/owner/outlet/settings", { autoStartShift: false });
    expect(set.json()).toMatchObject({ autoStartShift: false });

    const tablet = await r.signedInTablet(arjun.id, "3001");
    expect((await me(tablet)).shift).toBeNull();

    const a = shiftSchema.parse((await tablet.call("POST", "/api/staff/shift/start")).json());
    const b = shiftSchema.parse((await tablet.call("POST", "/api/staff/shift/start")).json());
    expect(b.id).toBe(a.id);
    expect((await me(tablet)).shift?.id).toBe(a.id);

    const changed = await h.prisma.auditLog.findFirstOrThrow({
      where: { action: "outlet.settingsChanged" },
    });
    expect(changed).toMatchObject({
      actorType: "OWNER",
      data: { before: { autoStartShift: true }, after: { autoStartShift: false } },
    });
  });

  it("End Shift closes the shift and signs out of the device", async () => {
    const { r, arjun } = await setup();
    const tablet = await r.signedInTablet(arjun.id, "3001");
    const end = await tablet.call("POST", "/api/staff/shift/end");
    expect(end.statusCode).toBe(204);
    expect((await tablet.call("GET", "/api/staff/me")).statusCode).toBe(401);
    expect(await h.prisma.shift.count({ where: { endedAt: null } })).toBe(0);
    expect(await h.prisma.auditLog.count({ where: { action: "shift.end" } })).toBe(1);
    // The device stays paired for the next person.
    expect((await tablet.call("GET", "/api/device/staff")).statusCode).toBe(200);
  });

  it("auto-closes a shift forgotten from an earlier day at start + 14 h", async () => {
    const { r, arjun } = await setup();
    const yesterday = new Date(Date.now() - 30 * 3600 * 1000);
    const forgotten = await h.prisma.shift.create({
      data: {
        organizationId: r.organizationId,
        outletId: r.outletId,
        employeeId: arjun.id,
        startedAt: yesterday,
      },
    });

    const tablet = await r.signedInTablet(arjun.id, "3001");
    const closed = await h.prisma.shift.findUniqueOrThrow({ where: { id: forgotten.id } });
    expect(closed.endedAt?.getTime()).toBe(yesterday.getTime() + 14 * 3600 * 1000);
    const today = await me(tablet);
    expect(today.shift?.id).not.toBe(forgotten.id);
    expect(
      await h.prisma.auditLog.findFirst({
        where: { action: "shift.autoClosed", entityId: forgotten.id },
      }),
    ).not.toBeNull();
  });

  it("two sign-ins at the same moment open only one shift", async () => {
    const { r, arjun } = await setup();
    await r.owner("PATCH", "/api/owner/outlet/settings", { autoStartShift: false });
    const tablet = await r.signedInTablet(arjun.id, "3001");
    await Promise.all([
      tablet.call("POST", "/api/staff/shift/start"),
      tablet.call("POST", "/api/staff/shift/start"),
      tablet.call("POST", "/api/staff/shift/start"),
    ]);
    expect(await h.prisma.shift.count({ where: { endedAt: null } })).toBe(1);
  });

  it("shift routes need a staff session; the setting needs staff.manage", async () => {
    const { r, arjun } = await setup();
    const noSession = await browser(h).call("POST", "/api/staff/shift/start");
    expect([noSession.statusCode, code(noSession)]).toEqual([401, "UNAUTHENTICATED"]);

    const tablet = await r.signedInTablet(arjun.id, "3001");
    const butler = await tablet.call("PATCH", "/api/owner/outlet/settings", {
      autoStartShift: false,
    });
    expect([butler.statusCode, code(butler)]).toEqual([403, "FORBIDDEN"]);
  });
});

describe("audit log", () => {
  it("records staff and device security events", async () => {
    const { r, arjun } = await setup();
    await r.owner("PATCH", `/api/owner/staff/${arjun.id}`, { role: "CASHIER" });
    await r.owner("PUT", `/api/owner/staff/${arjun.id}/pin`, { pin: "5830" });
    await r.deactivate(arjun.id);
    const { device, pairingCode } = await r.newDevice();
    await browser(h).call("POST", "/api/device/pair", { code: pairingCode });
    await r.owner("POST", `/api/owner/devices/${device.id}/unpair`);

    const actions = (
      await h.prisma.auditLog.findMany({ orderBy: { createdAt: "asc" }, select: { action: true } })
    ).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "staff.roleChanged",
        "staff.pinReset",
        "staff.deactivated",
        "device.paired",
        "device.unpaired",
      ]),
    );
    const role = await h.prisma.auditLog.findFirstOrThrow({
      where: { action: "staff.roleChanged" },
    });
    expect(role.data).toEqual({ from: "BUTLER", to: "CASHIER" });
  });

  it("records PIN lockouts", async () => {
    const { r, arjun } = await setup();
    const { pairingCode } = await r.newDevice();
    const tablet = browser(h);
    await tablet.call("POST", "/api/device/pair", { code: pairingCode });
    for (let i = 0; i < 5; i++) {
      await tablet.call("POST", "/api/device/login", { employeeId: arjun.id, pin: "9999" });
    }
    const locked = await h.prisma.auditLog.findFirstOrThrow({
      where: { action: "staff.pinLocked" },
    });
    expect(locked).toMatchObject({
      actorType: "SYSTEM",
      data: { employeeId: arjun.id, attempts: 5 },
    });
  });

  it("is append-only and tenant-scoped through the tenant client", async () => {
    const { r, arjun } = await setup();
    await r.deactivate(arjun.id);
    h.clearCookies();
    const other = await restaurant(h, "+919876500002");

    const getTenantDb = createTenantDbFactory(h.prisma);
    const a = getTenantDb({
      organizationId: r.organizationId,
      actor: { kind: "system", reason: "test" },
    });
    const row = await a.auditLog.findFirstOrThrow();
    await expect(
      a.auditLog.update({ where: { id: row.id }, data: { action: "x" } }),
    ).rejects.toBeInstanceOf(TenantViolationError);
    await expect(a.auditLog.deleteMany()).rejects.toBeInstanceOf(TenantViolationError);

    const b = getTenantDb({
      organizationId: other.organizationId,
      actor: { kind: "system", reason: "test" },
    });
    expect(await b.auditLog.count()).toBe(0);
  });
});
