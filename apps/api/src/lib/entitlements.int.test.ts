// M1-T4 entitlement stub: features and limits come from the outlet's plan (Growth until M12).
import { createTestDb, resetTestDb, seedPlans } from "@restoos/db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createEntitlements } from "./entitlements";

const db = createTestDb("api");
const ent = createEntitlements(db);
let ids: { organizationId: string; outletId: string };

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(async () => {
  await resetTestDb(db);
  await seedPlans(db);
  const org = await db.organization.create({ data: { name: "A", legalName: "A Pvt Ltd" } });
  const outlet = await db.outlet.create({
    data: { organizationId: org.id, code: "A1", name: "A1", address: "1 Road", stateCode: "27" },
  });
  ids = { organizationId: org.id, outletId: outlet.id };
});

async function subscribe(planKey: string, status: "ACTIVE" | "CORE_MODE" | "CANCELLED" = "ACTIVE") {
  const plan = await db.plan.findUniqueOrThrow({ where: { key: planKey } });
  await db.subscription.create({
    data: {
      ...ids,
      planId: plan.id,
      interval: "MONTHLY",
      status,
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    },
  });
}

describe("entitlements (stub)", () => {
  it("treats an outlet without a subscription as Growth", async () => {
    expect(await ent.hasFeature(ids.outletId, "BELL_SYSTEM")).toBe(true);
    expect(await ent.hasFeature(ids.outletId, "AI_INSIGHTS")).toBe(false);
    expect(await ent.getLimit(ids.outletId, "MAX_STAFF")).toBe(20);
  });

  it("uses the subscribed plan", async () => {
    await subscribe("STARTER");
    expect(await ent.hasFeature(ids.outletId, "BELL_SYSTEM")).toBe(false);
    expect(await ent.getLimit(ids.outletId, "MAX_STAFF")).toBe(5);
  });

  it("reports unlimited as Infinity", async () => {
    await subscribe("PRO");
    expect(await ent.getLimit(ids.outletId, "MAX_OUTLETS")).toBe(Infinity);
    expect(await ent.hasFeature(ids.outletId, "AI_INSIGHTS")).toBe(true);
  });

  it("keeps billing on in core mode but switches paid features off", async () => {
    await subscribe("GROWTH", "CORE_MODE");
    expect(await ent.hasFeature(ids.outletId, "POS_CORE")).toBe(true);
    expect(await ent.hasFeature(ids.outletId, "OFFLINE")).toBe(true);
    expect(await ent.hasFeature(ids.outletId, "BELL_SYSTEM")).toBe(false);
    expect(await ent.getLimit(ids.outletId, "MAX_STAFF")).toBe(20);
  });
});
