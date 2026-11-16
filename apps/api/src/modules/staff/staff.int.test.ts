// M1-T5: owners manage the outlet's staff; PINs are hashed, limits and manager scope enforced.
import { verify } from "@node-rs/argon2";
import { seedPlans } from "@restoos/db/testing";
import { apiErrorSchema, employeeSchema, staffListResponseSchema } from "@restoos/shared";
import { afterEach, describe, expect, it } from "vitest";
import { createEntitlements } from "../../lib/entitlements";
import { createTenantDbFactory, type TenantContext } from "../../lib/tenant";
import { OUTLET_HEADER } from "../../plugins/tenant";
import { createAuthHarness } from "../../test/auth-harness";
import { createEmployee, updateEmployee } from "./service";

type Harness = Awaited<ReturnType<typeof createAuthHarness>>;
let h: Harness;

afterEach(async () => {
  await h.close();
});

/** Signs in a new owner, onboards, and returns request helpers bound to their outlet. */
async function ownerWithOutlet(phone = "+919876543210") {
  await h.signInWithPhone(phone);
  const res = await h.request("POST", "/api/onboarding", {
    organization: { name: "Saffron Table", legalName: "Saffron Table Pvt Ltd" },
    outlet: {
      name: "Bandra",
      address: "12 Hill Road, Bandra West, Mumbai 400050",
      stateCode: "27",
      pricesIncludeTax: false,
      code: "ST",
    },
  });
  const { organizationId, outletId } = res.json<{ organizationId: string; outletId: string }>();
  const hdr = { [OUTLET_HEADER]: outletId };
  return {
    organizationId,
    outletId,
    list: () => h.request("GET", "/api/owner/staff", undefined, hdr),
    add: (body: object) => h.request("POST", "/api/owner/staff", body, hdr),
    patch: (id: string, body: object) =>
      h.app.inject({
        method: "PATCH",
        url: `/api/owner/staff/${id}`,
        payload: body,
        headers: { ...hdr, origin: "http://localhost:3000", cookie: cookie() },
      }),
    pin: (id: string, pin: string) =>
      h.app.inject({
        method: "PUT",
        url: `/api/owner/staff/${id}/pin`,
        payload: { pin },
        headers: { ...hdr, origin: "http://localhost:3000", cookie: cookie() },
      }),
  };
}
const cookie = () => [...h.jar].map(([k, v]) => `${k}=${v}`).join("; ");
const code = (res: { json: () => unknown }) => apiErrorSchema.parse(res.json()).error.code;

async function setup() {
  h = await createAuthHarness();
  await seedPlans(h.prisma);
}

describe("/api/owner/staff", () => {
  it("adds, lists, edits and deactivates staff; the PIN is hashed and never returned", async () => {
    await setup();
    const o = await ownerWithOutlet();

    const added = await o.add({
      name: "Meera",
      phone: "98765 43210",
      role: "MANAGER",
      pin: "4827",
    });
    expect(added.statusCode, added.body).toBe(201);
    const meera = employeeSchema.parse(added.json());
    expect(meera).toMatchObject({ name: "Meera", phone: "+919876543210", isActive: true });
    expect(added.body).not.toContain("4827");
    expect(added.body).not.toContain("pinHash");

    const row = await h.prisma.employee.findUniqueOrThrow({ where: { id: meera.id } });
    expect(row.pinHash).not.toBe("4827");
    expect(await verify(row.pinHash, "4827")).toBe(true);
    expect(row.outletId).toBe(o.outletId);

    await o.add({ name: "Arjun", role: "BUTLER", pin: "3001" });
    const list = staffListResponseSchema.parse((await o.list()).json());
    expect(list.employees.map((e) => e.name)).toEqual(["Arjun", "Meera"]);
    expect(list.limit).toEqual({ used: 2, max: 20 }); // Growth stand-in

    const edited = await o.patch(meera.id, { role: "CASHIER", phone: null });
    expect(edited.json()).toMatchObject({ role: "CASHIER", phone: null });

    const off = await o.patch(meera.id, { isActive: false });
    expect(off.json()).toMatchObject({ isActive: false });
    const after = staffListResponseSchema.parse((await o.list()).json());
    expect(after.employees.map((e) => [e.name, e.isActive])).toEqual([
      ["Arjun", true],
      ["Meera", false],
    ]);
    expect(after.limit.used).toBe(1);
  });

  it("rejects weak PINs and bad input", async () => {
    await setup();
    const o = await ownerWithOutlet();
    for (const pin of ["1234", "1111", "12"]) {
      const res = await o.add({ name: "Arjun", role: "BUTLER", pin });
      expect([res.statusCode, code(res)]).toEqual([400, "VALIDATION_ERROR"]);
    }
    expect(await h.prisma.employee.count()).toBe(0);
  });

  it("signs the person out everywhere on deactivate and PIN reset", async () => {
    await setup();
    const o = await ownerWithOutlet();
    const arjun = employeeSchema.parse(
      (await o.add({ name: "Arjun", role: "BUTLER", pin: "3001" })).json(),
    );
    const device = await h.prisma.device.create({
      data: {
        organizationId: o.organizationId,
        outletId: o.outletId,
        code: "D1",
        label: "Counter",
        deviceSecretHash: "x",
      },
    });
    const session = (n: string) =>
      h.prisma.staffSession.create({
        data: {
          organizationId: o.organizationId,
          employeeId: arjun.id,
          deviceId: device.id,
          tokenHash: n,
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });

    await session("t1");
    expect((await o.pin(arjun.id, "5830")).statusCode).toBe(204);
    expect(await h.prisma.staffSession.count()).toBe(0);
    const row = await h.prisma.employee.findUniqueOrThrow({ where: { id: arjun.id } });
    expect(await verify(row.pinHash, "5830")).toBe(true);

    await session("t2");
    await o.patch(arjun.id, { isActive: false });
    expect(await h.prisma.staffSession.count()).toBe(0);
  });

  it("enforces the plan's staff limit on add and reactivate", async () => {
    await setup();
    const o = await ownerWithOutlet();
    const starter = await h.prisma.plan.findUniqueOrThrow({ where: { key: "STARTER" } });
    await h.prisma.subscription.create({
      data: {
        organizationId: o.organizationId,
        outletId: o.outletId,
        planId: starter.id,
        interval: "MONTHLY",
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    const ids: string[] = [];
    for (const [i, pin] of ["3001", "3002", "3003", "3004", "3005"].entries()) {
      ids.push(
        employeeSchema.parse((await o.add({ name: `Staff ${i}`, role: "BUTLER", pin })).json()).id,
      );
    }
    const sixth = await o.add({ name: "Staff 6", role: "BUTLER", pin: "3006" });
    expect([sixth.statusCode, code(sixth)]).toEqual([403, "STAFF_LIMIT_REACHED"]);

    // Deactivate one, add another, then reactivating the first would exceed the limit.
    const first = ids[0] ?? "";
    await o.patch(first, { isActive: false });
    expect((await o.add({ name: "Staff 6", role: "BUTLER", pin: "3006" })).statusCode).toBe(201);
    const back = await o.patch(first, { isActive: true });
    expect([back.statusCode, code(back)]).toEqual([403, "STAFF_LIMIT_REACHED"]);
  });

  it("can't touch another restaurant's staff", async () => {
    await setup();
    const a = await ownerWithOutlet("+919876500001");
    const theirs = employeeSchema.parse(
      (await a.add({ name: "Arjun", role: "BUTLER", pin: "3001" })).json(),
    );
    h.clearCookies();
    const b = await ownerWithOutlet("+919876500002");

    const res = await b.patch(theirs.id, { name: "pwned" });
    expect([res.statusCode, code(res)]).toEqual([404, "NOT_FOUND"]);
    expect((await b.pin(theirs.id, "5830")).statusCode).toBe(404);
    expect(staffListResponseSchema.parse((await b.list()).json()).employees).toEqual([]);
  });

  it("requires sign-in and an outlet", async () => {
    await setup();
    const signedOut = await h.request("GET", "/api/owner/staff");
    expect(signedOut.statusCode).toBe(401);
    await ownerWithOutlet();
    const noOutlet = await h.request("GET", "/api/owner/staff");
    expect([noOutlet.statusCode, code(noOutlet)]).toEqual([400, "OUTLET_REQUIRED"]);
  });
});

describe("manager scope (service)", () => {
  it("a manager manages cashiers, butlers and kitchen staff — not managers", async () => {
    await setup();
    const o = await ownerWithOutlet();
    const ctx: TenantContext = {
      organizationId: o.organizationId,
      outletId: o.outletId,
      actor: { kind: "staff", employeeId: "mgr", role: "MANAGER" },
    };
    const deps = {
      ctx,
      db: createTenantDbFactory(h.prisma)(ctx),
      entitlements: createEntitlements(h.prisma),
    };

    const butler = await createEmployee(deps, { name: "Arjun", role: "BUTLER", pin: "3001" });
    await expect(
      createEmployee(deps, { name: "Kabir", role: "MANAGER", pin: "2001" }),
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    await expect(updateEmployee(deps, butler.id, { role: "MANAGER" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(updateEmployee(deps, butler.id, { role: "CASHIER" })).resolves.toMatchObject({
      role: "CASHIER",
    });
  });
});
