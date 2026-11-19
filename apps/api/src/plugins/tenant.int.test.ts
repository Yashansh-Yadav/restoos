// M1-T4: requests resolve to a tenant, and permission/plan checks reject in the shared shape.
import { seedPlans } from "@restoos/db/testing";
import { apiErrorSchema } from "@restoos/shared";
import { afterEach, describe, expect, it } from "vitest";
import { buildModuleDeps } from "../module-deps";
import { createAuthHarness } from "../test/auth-harness";
import { OUTLET_HEADER, tenantOf } from "./tenant";

type Harness = Awaited<ReturnType<typeof createAuthHarness>>;
let h: Harness;

afterEach(async () => {
  await h.close();
});

async function setup() {
  h = await createAuthHarness({
    setup: (app, deps) => {
      const m = buildModuleDeps(deps);
      app.get(
        "/api/test/staff",
        { preHandler: [m.resolveTenant, m.requirePermission("staff.manage")] },
        (request) => tenantOf(request),
      );
      app.get(
        "/api/test/billing",
        { preHandler: [m.resolveTenant, m.requirePermission("billing.manageSubscription")] },
        () => ({ ok: true }),
      );
      app.get(
        "/api/test/bell",
        { preHandler: [m.resolveTenant, m.requireFeature("BELL_SYSTEM")] },
        () => ({ ok: true }),
      );
    },
  });
  await seedPlans(h.prisma);
}

async function onboardOwner(phone = "+919876543210") {
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
  return res.json<{ organizationId: string; outletId: string }>();
}

const errorCode = (res: { json: () => unknown }) => apiErrorSchema.parse(res.json()).error.code;

describe("tenant resolution + permission checks", () => {
  it("lets an owner through with their organisation as the tenant", async () => {
    await setup();
    const { organizationId, outletId } = await onboardOwner();

    const res = await h.request("GET", "/api/test/staff");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ organizationId, actor: { kind: "owner", role: "OWNER" } });
    expect(res.json()).not.toHaveProperty("outletId");

    const withOutlet = await h.request("GET", "/api/test/staff", undefined, {
      [OUTLET_HEADER]: outletId,
    });
    expect(withOutlet.json()).toMatchObject({ organizationId, outletId });
  });

  it("rejects signed-out and not-yet-onboarded users", async () => {
    await setup();
    const signedOut = await h.request("GET", "/api/test/staff");
    expect([signedOut.statusCode, errorCode(signedOut)]).toEqual([401, "UNAUTHENTICATED"]);

    await h.signInWithPhone("+919876543210");
    const fresh = await h.request("GET", "/api/test/staff");
    expect([fresh.statusCode, errorCode(fresh)]).toEqual([403, "ONBOARDING_REQUIRED"]);
  });

  it("refuses an outlet of another organisation", async () => {
    await setup();
    const other = await onboardOwner("+919876500001");
    h.clearCookies();
    await onboardOwner("+919876500002");

    const res = await h.request("GET", "/api/test/staff", undefined, {
      [OUTLET_HEADER]: other.outletId,
    });
    expect([res.statusCode, errorCode(res)]).toEqual([403, "OUTLET_FORBIDDEN"]);
  });

  it("enforces the role: an ADMIN can manage staff but not the RestoOS subscription", async () => {
    await setup();
    await onboardOwner();
    expect((await h.request("GET", "/api/test/billing")).statusCode).toBe(200);

    await h.prisma.ownerAccount.updateMany({ data: { role: "ADMIN" } });
    expect((await h.request("GET", "/api/test/staff")).statusCode).toBe(200);
    const billing = await h.request("GET", "/api/test/billing");
    expect([billing.statusCode, errorCode(billing)]).toEqual([403, "FORBIDDEN"]);
  });

  it("checks plan features for the chosen outlet", async () => {
    await setup();
    const { outletId } = await onboardOwner();

    const noOutlet = await h.request("GET", "/api/test/bell");
    expect([noOutlet.statusCode, errorCode(noOutlet)]).toEqual([400, "OUTLET_REQUIRED"]);

    // No subscription yet → Growth stand-in: the bell is included.
    const bell = () => h.request("GET", "/api/test/bell", undefined, { [OUTLET_HEADER]: outletId });
    expect((await bell()).statusCode).toBe(200);

    const starter = await h.prisma.plan.findUniqueOrThrow({ where: { key: "STARTER" } });
    const outlet = await h.prisma.outlet.findUniqueOrThrow({ where: { id: outletId } });
    await h.prisma.subscription.create({
      data: {
        organizationId: outlet.organizationId,
        outletId,
        planId: starter.id,
        interval: "MONTHLY",
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    const denied = await bell();
    expect([denied.statusCode, errorCode(denied)]).toEqual([403, "FEATURE_NOT_IN_PLAN"]);
  });

  it("returns the owner's permissions from /api/me", async () => {
    await setup();
    await onboardOwner();
    const me = (await h.request("GET", "/api/me")).json<{ owner: { permissions: string[] } }>();
    expect(me.owner.permissions).toContain("billing.manageSubscription");
    expect(me.owner.permissions).toHaveLength(17);
  });
});
