// M1-T3 acceptance: one restaurant can never read or change another's menu or bills through
// getTenantDb(ctx); outlet contexts are confined to their outlet.
import { createTestDb, resetTestDb } from "@restoos/db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTenantDbFactory, TenantViolationError, type TenantContext } from "./tenant";

const db = createTestDb("api");
const getTenantDb = createTenantDbFactory(db);

afterAll(async () => {
  await db.$disconnect();
});

async function makeOutlet(organizationId: string, code: string) {
  const outlet = await db.outlet.create({
    data: { organizationId, code, name: `Outlet ${code}`, address: "1 Test Road", stateCode: "27" },
  });
  const ids = { organizationId, outletId: outlet.id };
  const device = await db.device.create({
    data: { ...ids, code: "D1", label: "Counter", deviceSecretHash: "x" },
  });
  const category = await db.menuCategory.create({ data: { ...ids, name: `Mains ${code}` } });
  const item = await db.menuItem.create({
    data: {
      ...ids,
      categoryId: category.id,
      name: `Dal ${code}`,
      dietType: "VEG",
      basePrice: 20_000,
      taxRateBps: 500,
    },
  });
  const bill = await db.bill.create({
    data: {
      ...ids,
      deviceId: device.id,
      invoiceNumber: `${code}-2627-D1000001`,
      fy: "2627",
      subtotal: 20_000,
      discountTotal: 0,
      taxableTotal: 20_000,
      cgstTotal: 500,
      sgstTotal: 500,
      roundOff: 0,
      grandTotal: 21_000,
      lines: [],
      taxBreakup: [],
      createdById: "emp",
      clientId: `bill-${code}`,
    },
  });
  return { outlet, category, item, bill };
}

let a: {
  orgId: string;
  a1: Awaited<ReturnType<typeof makeOutlet>>;
  a2: Awaited<ReturnType<typeof makeOutlet>>;
};
let b: { orgId: string; b1: Awaited<ReturnType<typeof makeOutlet>> };
let ownerA: TenantContext;

beforeEach(async () => {
  await resetTestDb(db);
  const orgA = await db.organization.create({ data: { name: "A", legalName: "A Pvt Ltd" } });
  const orgB = await db.organization.create({ data: { name: "B", legalName: "B Pvt Ltd" } });
  a = { orgId: orgA.id, a1: await makeOutlet(orgA.id, "A1"), a2: await makeOutlet(orgA.id, "A2") };
  b = { orgId: orgB.id, b1: await makeOutlet(orgB.id, "B1") };
  ownerA = { organizationId: a.orgId, actor: { kind: "owner", userId: "u-a" } };
});

describe("getTenantDb: reads", () => {
  it("an organisation sees only its own menu and bills", async () => {
    const t = getTenantDb(ownerA);
    const items = await t.menuItem.findMany({ orderBy: { name: "asc" } });
    expect(items.map((i) => i.name)).toEqual(["Dal A1", "Dal A2"]);
    expect(await t.bill.count()).toBe(2);
    expect(await t.menuItem.count({ where: { name: "Dal B1" } })).toBe(0);
    const sum = await t.bill.aggregate({ _sum: { grandTotal: true } });
    expect(sum._sum.grandTotal).toBe(42_000);
  });

  it("another organisation's id behaves like a missing row", async () => {
    const t = getTenantDb(ownerA);
    expect(await t.bill.findUnique({ where: { id: b.b1.bill.id } })).toBeNull();
    expect(await t.menuItem.findFirst({ where: { id: b.b1.item.id } })).toBeNull();
    await expect(t.bill.findUniqueOrThrow({ where: { id: b.b1.bill.id } })).rejects.toThrow();
    expect(await t.organization.findUnique({ where: { id: b.orgId } })).toBeNull();
    expect((await t.organization.findMany()).map((o) => o.id)).toEqual([a.orgId]);
    // Relation includes are filtered from the root: B's bill is never reached.
    const outlets = await t.outlet.findMany({ include: { bills: true } });
    expect(
      outlets
        .flatMap((o) => o.bills)
        .map((x) => x.id)
        .sort(),
    ).toEqual([a.a1.bill.id, a.a2.bill.id].sort());
  });

  it("an outlet context is confined to its outlet", async () => {
    const t = getTenantDb({ ...ownerA, outletId: a.a1.outlet.id });
    expect((await t.menuItem.findMany()).map((i) => i.name)).toEqual(["Dal A1"]);
    expect(await t.bill.findUnique({ where: { id: a.a2.bill.id } })).toBeNull();
  });
});

describe("getTenantDb: writes", () => {
  it("cannot update or delete another organisation's rows", async () => {
    const t = getTenantDb(ownerA);
    await expect(
      t.menuItem.update({ where: { id: b.b1.item.id }, data: { inStock: false } }),
    ).rejects.toMatchObject({ code: "P2025" });
    await expect(t.menuCategory.delete({ where: { id: b.b1.category.id } })).rejects.toMatchObject({
      code: "P2025",
    });
    expect((await t.menuItem.updateMany({ data: { inStock: false } })).count).toBe(2);
    expect((await db.menuItem.findUniqueOrThrow({ where: { id: b.b1.item.id } })).inStock).toBe(
      true,
    );
    await expect(
      t.organization.update({ where: { id: b.orgId }, data: { name: "pwned" } }),
    ).rejects.toMatchObject({ code: "P2025" });
  });

  it("fills the tenant on create and rejects another tenant's ids", async () => {
    const t = getTenantDb({ ...ownerA, outletId: a.a1.outlet.id });
    // The generated types still require the tenant columns; the extension fills them at runtime.
    const created = await t.menuCategory.create({ data: { name: "Desserts" } as never });
    expect(created).toMatchObject({ organizationId: a.orgId, outletId: a.a1.outlet.id });

    await expect(
      t.menuCategory.create({
        data: { organizationId: b.orgId, outletId: a.a1.outlet.id, name: "x" },
      }),
    ).rejects.toBeInstanceOf(TenantViolationError);
  });

  it("an owner can't create rows in another organisation's outlet", async () => {
    const t = getTenantDb(ownerA);
    await expect(
      t.menuCategory.create({
        data: { organizationId: a.orgId, outletId: b.b1.outlet.id, name: "x" },
      }),
    ).rejects.toBeInstanceOf(TenantViolationError);
    await expect(
      t.menuItem.update({ where: { id: a.a1.item.id }, data: { outletId: b.b1.outlet.id } }),
    ).rejects.toBeInstanceOf(TenantViolationError);
    // Own outlets are fine.
    await expect(
      t.menuCategory.create({
        data: { organizationId: a.orgId, outletId: a.a2.outlet.id, name: "ok" },
      }),
    ).resolves.toMatchObject({ outletId: a.a2.outlet.id });
  });

  it("applies inside interactive transactions", async () => {
    const t = getTenantDb(ownerA);
    const seen = await t.$transaction(async (tx) => tx.bill.count());
    expect(seen).toBe(2);
  });
});

describe("getTenantDb: off-limits", () => {
  it("auth tables and raw SQL are unreachable; plans are read-only", async () => {
    const t = getTenantDb(ownerA);
    const raw = t as unknown as {
      user: { findMany(): Promise<unknown> };
      $queryRawUnsafe(sql: string): Promise<unknown>;
    };
    await expect(raw.user.findMany()).rejects.toBeInstanceOf(TenantViolationError);
    await expect(raw.$queryRawUnsafe("select 1")).rejects.toBeInstanceOf(TenantViolationError);
    await expect(t.plan.findMany()).resolves.toBeInstanceOf(Array);
    await expect(t.plan.deleteMany()).rejects.toBeInstanceOf(TenantViolationError);
    await expect(
      t.organization.create({ data: { name: "x", legalName: "x" } }),
    ).rejects.toBeInstanceOf(TenantViolationError);
  });
});
