// M1-T6: pair a device with a one-time code, sign staff in with name + PIN, lock after 5 wrong
// PINs, and keep sessions bound to their device.
import { seedPlans } from "@restoos/db/testing";
import {
  apiErrorSchema,
  deviceStaffResponseSchema,
  employeeSchema,
  pairingCodeResponseSchema,
  staffMeResponseSchema,
} from "@restoos/shared";
import type { LightMyRequestResponse } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildModuleDeps } from "../../module-deps";
import { OUTLET_HEADER } from "../../plugins/tenant";
import { createAuthHarness, ORIGIN } from "../../test/auth-harness";

type Harness = Awaited<ReturnType<typeof createAuthHarness>>;
let h: Harness;

afterEach(async () => {
  vi.useRealTimers();
  await h.close();
});

const code = (res: LightMyRequestResponse) => apiErrorSchema.parse(res.json()).error.code;
const details = (res: LightMyRequestResponse) =>
  apiErrorSchema.parse(res.json()).error.details as Record<string, number>;

/** A browser of its own (cookie jar), e.g. the restaurant's counter tablet. */
function browser() {
  const jar = new Map<string, string>();
  return {
    jar,
    async call(method: "GET" | "POST", url: string, payload?: object, ip = "198.51.100.1") {
      const res = await h.app.inject({
        method,
        url,
        ...(payload ? { payload } : {}),
        headers: {
          origin: ORIGIN,
          cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
          "x-forwarded-for": ip,
        },
        remoteAddress: ip,
      });
      for (const c of res.cookies) {
        if (c.maxAge === 0 || c.value === "" || (c.expires && c.expires.getTime() < Date.now())) {
          jar.delete(c.name);
        } else jar.set(c.name, c.value);
      }
      return res;
    },
  };
}

/** Owner onboarded, with staff and an `owner(...)` helper bound to their outlet. */
async function restaurant(phone = "+919876543210") {
  await h.signInWithPhone(phone);
  const onboarded = await h.request("POST", "/api/onboarding", {
    organization: { name: "Saffron Table", legalName: "Saffron Table Pvt Ltd" },
    outlet: {
      name: "Bandra",
      address: "12 Hill Road, Bandra West, Mumbai 400050",
      stateCode: "27",
      pricesIncludeTax: false,
      code: "ST",
    },
  });
  const { outletId } = onboarded.json<{ outletId: string }>();
  const owner = (method: "GET" | "POST", url: string, body?: object) =>
    h.request(method, url, body, { [OUTLET_HEADER]: outletId });
  const addStaff = async (name: string, role: string, pin: string) =>
    employeeSchema.parse((await owner("POST", "/api/owner/staff", { name, role, pin })).json());
  const newDevice = async (label = "Counter tablet") =>
    pairingCodeResponseSchema.parse(
      (await owner("POST", "/api/owner/devices", { label, isStation: false })).json(),
    );
  const deactivate = (id: string) =>
    h.app.inject({
      method: "PATCH",
      url: `/api/owner/staff/${id}`,
      payload: { isActive: false },
      headers: {
        origin: ORIGIN,
        [OUTLET_HEADER]: outletId,
        cookie: [...h.jar].map(([k, v]) => `${k}=${v}`).join("; "),
      },
    });
  return { outletId, owner, addStaff, newDevice, deactivate };
}

async function setup() {
  h = await createAuthHarness();
  await seedPlans(h.prisma);
}

describe("device pairing", () => {
  it("registers a device with the next free code and a one-time 8-digit code", async () => {
    await setup();
    const r = await restaurant();
    const first = await r.newDevice("Counter tablet");
    expect(first.device).toMatchObject({ code: "D1", label: "Counter tablet", paired: false });
    expect(first.pairingCode).toMatch(/^\d{8}$/);
    expect((await r.newDevice("Kitchen tablet")).device.code).toBe("D2");

    const tablet = browser();
    const paired = await tablet.call("POST", "/api/device/pair", { code: first.pairingCode });
    expect(paired.statusCode, paired.body).toBe(200);
    expect(paired.json()).toEqual({ device: { label: "Counter tablet", outletName: "Bandra" } });
    expect(tablet.jar.has("restoos_device")).toBe(true);
    const cookie = paired.cookies.find((c) => c.name === "restoos_device");
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });

    // Single use.
    const again = await browser().call("POST", "/api/device/pair", { code: first.pairingCode });
    expect([again.statusCode, code(again)]).toEqual([400, "INVALID_PAIRING_CODE"]);

    const list = (await r.owner("GET", "/api/owner/devices")).json<{
      devices: { paired: boolean }[];
    }>();
    expect(list.devices.map((d) => d.paired)).toEqual([true, false]);
  });

  it("a new code replaces the old one; codes expire after 10 minutes", async () => {
    await setup();
    const r = await restaurant();
    const { device, pairingCode: old } = await r.newDevice();
    const fresh = pairingCodeResponseSchema.parse(
      (await r.owner("POST", `/api/owner/devices/${device.id}/pairing-code`)).json(),
    );
    expect(code(await browser().call("POST", "/api/device/pair", { code: old }))).toBe(
      "INVALID_PAIRING_CODE",
    );

    // Expiry is Redis TTL: simulate it by expiring the key now.
    await h.redis.expire((await h.redis.keys("pair:code:*"))[0] ?? "", 0);
    expect(
      code(await browser().call("POST", "/api/device/pair", { code: fresh.pairingCode })),
    ).toBe("INVALID_PAIRING_CODE");
  });

  it("re-pairing moves the device: the old browser stops working", async () => {
    await setup();
    const r = await restaurant();
    const { device, pairingCode } = await r.newDevice();
    const oldTablet = browser();
    await oldTablet.call("POST", "/api/device/pair", { code: pairingCode });
    expect((await oldTablet.call("GET", "/api/device/staff")).statusCode).toBe(200);

    const next = pairingCodeResponseSchema.parse(
      (await r.owner("POST", `/api/owner/devices/${device.id}/pairing-code`)).json(),
    );
    await browser().call("POST", "/api/device/pair", { code: next.pairingCode });
    const stale = await oldTablet.call("GET", "/api/device/staff");
    expect([stale.statusCode, code(stale)]).toEqual([401, "DEVICE_NOT_PAIRED"]);
  });

  it("limits pairing guesses per IP", async () => {
    await setup();
    const guesser = browser();
    for (let i = 0; i < 10; i++) {
      const res = await guesser.call(
        "POST",
        "/api/device/pair",
        { code: "12345678" },
        "203.0.113.50",
      );
      expect(code(res)).toBe("INVALID_PAIRING_CODE");
    }
    const blocked = await guesser.call(
      "POST",
      "/api/device/pair",
      { code: "12345678" },
      "203.0.113.50",
    );
    expect([blocked.statusCode, code(blocked)]).toEqual([429, "TOO_MANY_ATTEMPTS"]);
  });

  it("another restaurant can't see, re-code or unpair the device", async () => {
    await setup();
    const a = await restaurant("+919876500001");
    const { device } = await a.newDevice();
    h.clearCookies();
    const b = await restaurant("+919876500002");
    expect((await b.owner("GET", "/api/owner/devices")).json()).toEqual({ devices: [] });
    expect((await b.owner("POST", `/api/owner/devices/${device.id}/pairing-code`)).statusCode).toBe(
      404,
    );
    expect((await b.owner("POST", `/api/owner/devices/${device.id}/unpair`)).statusCode).toBe(404);
  });
});

describe("staff PIN sign-in", () => {
  async function pairedTablet() {
    const r = await restaurant();
    const arjun = await r.addStaff("Arjun", "BUTLER", "3001");
    const meera = await r.addStaff("Meera", "MANAGER", "905172");
    await r.deactivate((await r.addStaff("Gone", "BUTLER", "3002")).id);
    const { device, pairingCode } = await r.newDevice();
    const tablet = browser();
    await tablet.call("POST", "/api/device/pair", { code: pairingCode });
    return { r, arjun, meera, device, tablet };
  }

  it("shows the outlet's active staff and signs a butler in", async () => {
    await setup();
    const { arjun, tablet } = await pairedTablet();

    const tiles = deviceStaffResponseSchema.parse(
      (await tablet.call("GET", "/api/device/staff")).json(),
    );
    expect(tiles.staff.map((s) => [s.name, s.role, s.pinLength])).toEqual([
      ["Arjun", "BUTLER", 4],
      ["Meera", "MANAGER", 6],
    ]);
    expect(JSON.stringify(tiles)).not.toMatch(/pinHash|phone/);

    const login = await tablet.call("POST", "/api/device/login", {
      employeeId: arjun.id,
      pin: "3001",
    });
    expect(login.statusCode, login.body).toBe(204);
    const me = staffMeResponseSchema.parse((await tablet.call("GET", "/api/staff/me")).json());
    expect(me).toMatchObject({
      employee: { name: "Arjun", role: "BUTLER" },
      outlet: { name: "Bandra" },
      device: { label: "Counter tablet" },
    });
    expect(me.permissions).toEqual(["order.create", "bell.respond"]);
  });

  it("locks the device after 5 wrong PINs — even the right PIN waits", async () => {
    await setup();
    const { arjun, tablet } = await pairedTablet();
    const attempt = (pin: string) =>
      tablet.call("POST", "/api/device/login", { employeeId: arjun.id, pin });

    for (let left = 4; left >= 1; left--) {
      const res = await attempt("9999");
      expect([res.statusCode, code(res), details(res).attemptsLeft]).toEqual([
        401,
        "WRONG_PIN",
        left,
      ]);
    }
    const fifth = await attempt("9999");
    expect([fifth.statusCode, code(fifth)]).toEqual([429, "PIN_LOCKED"]);
    expect(details(fifth).retryAfterSeconds).toBeGreaterThan(290);

    const right = await attempt("3001");
    expect([right.statusCode, code(right)]).toEqual([429, "PIN_LOCKED"]);

    // The lock is the Redis window: once it lapses, the right PIN works.
    await h.redis.del((await h.redis.keys("pin:fail:*"))[0] ?? "");
    expect((await attempt("3001")).statusCode).toBe(204);
  });

  it("binds the session to its device and ends it on switch user, deactivate and unpair", async () => {
    await setup();
    const { r, arjun, device, tablet } = await pairedTablet();
    await tablet.call("POST", "/api/device/login", { employeeId: arjun.id, pin: "3001" });

    // The staff cookie alone, on another (paired) device, is useless.
    const other = await r.newDevice("Phone");
    const phone = browser();
    await phone.call("POST", "/api/device/pair", { code: other.pairingCode });
    phone.jar.set("restoos_staff", tablet.jar.get("restoos_staff") ?? "");
    expect((await phone.call("GET", "/api/staff/me")).statusCode).toBe(401);

    // Switch user.
    expect((await tablet.call("POST", "/api/staff/logout")).statusCode).toBe(204);
    expect((await tablet.call("GET", "/api/staff/me")).statusCode).toBe(401);
    expect((await tablet.call("GET", "/api/device/staff")).statusCode).toBe(200); // still paired

    // Deactivation signs them out.
    await tablet.call("POST", "/api/device/login", { employeeId: arjun.id, pin: "3001" });
    await r.deactivate(arjun.id);
    expect((await tablet.call("GET", "/api/staff/me")).statusCode).toBe(401);

    // Unpair signs everyone out and the device cookie stops working.
    const meera = await r.addStaff("Kabir", "CASHIER", "2001");
    await tablet.call("POST", "/api/device/login", { employeeId: meera.id, pin: "2001" });
    expect((await tablet.call("GET", "/api/staff/me")).statusCode).toBe(200);
    expect((await r.owner("POST", `/api/owner/devices/${device.id}/unpair`)).json()).toMatchObject({
      paired: false,
    });
    expect((await tablet.call("GET", "/api/staff/me")).statusCode).toBe(401);
    expect(code(await tablet.call("GET", "/api/device/staff"))).toBe("DEVICE_NOT_PAIRED");
  });

  it("can't sign in as someone from another outlet or without a paired device", async () => {
    await setup();
    const { tablet } = await pairedTablet();
    h.clearCookies();
    const other = await restaurant("+919876500009");
    const stranger = await other.addStaff("Stranger", "BUTLER", "3005");
    const res = await tablet.call("POST", "/api/device/login", {
      employeeId: stranger.id,
      pin: "3005",
    });
    expect([res.statusCode, code(res)]).toEqual([401, "WRONG_PIN"]);

    const unpaired = await browser().call("POST", "/api/device/login", {
      employeeId: stranger.id,
      pin: "3005",
    });
    expect(code(unpaired)).toBe("DEVICE_NOT_PAIRED");
  });

  it("staff sessions resolve to a staff tenant with the role's permissions", async () => {
    h = await createAuthHarness({
      setup: (app, deps) => {
        const m = buildModuleDeps(deps);
        app.get(
          "/api/test/order",
          { preHandler: [m.resolveTenant, m.requirePermission("order.create")] },
          (request) => request.tenant ?? null,
        );
      },
    });
    await seedPlans(h.prisma);
    const { arjun, tablet } = await pairedTablet();
    await tablet.call("POST", "/api/device/login", { employeeId: arjun.id, pin: "3001" });

    const ok = await tablet.call("GET", "/api/test/order");
    expect(ok.json()).toMatchObject({
      actor: { kind: "staff", employeeId: arjun.id, role: "BUTLER" },
    });
    // A butler isn't a staff admin.
    const admin = await tablet.call("GET", "/api/owner/staff");
    expect([admin.statusCode, code(admin)]).toEqual([403, "FORBIDDEN"]);
  });
});
