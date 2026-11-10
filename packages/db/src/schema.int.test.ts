// Integration tests against the test database: schema rules the product relies on.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, resetTestDb } from "./testing";

const db = createTestDb();

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(async () => {
  await resetTestDb(db);
});

async function makeOutlet(code = "A1") {
  const org = await db.organization.create({
    data: { name: "Test Org", legalName: "Test Org Pvt Ltd" },
  });
  const outlet = await db.outlet.create({
    data: {
      organizationId: org.id,
      code,
      name: "Test Outlet",
      address: "1 Test Road",
      stateCode: "27",
    },
  });
  const device = await db.device.create({
    data: {
      organizationId: org.id,
      outletId: outlet.id,
      code: "D1",
      label: "Counter",
      deviceSecretHash: "x",
    },
  });
  return { org, outlet, device };
}

function billData(
  ids: { organizationId: string; outletId: string; deviceId: string },
  invoiceNumber: string,
  clientId: string,
) {
  return {
    ...ids,
    invoiceNumber,
    fy: "2627",
    subtotal: 10_000,
    discountTotal: 0,
    taxableTotal: 10_000,
    cgstTotal: 250,
    sgstTotal: 250,
    roundOff: 0,
    grandTotal: 10_500,
    lines: [],
    taxBreakup: [],
    createdById: "emp",
    clientId,
  };
}

describe("schema rules (test database)", () => {
  it("starts every test with empty tables", async () => {
    expect(await db.organization.count()).toBe(0);
    await makeOutlet();
    expect(await db.organization.count()).toBe(1);
  });

  it("allows the same outlet code in different orgs but not twice in one org", async () => {
    const { org } = await makeOutlet("A1");
    await expect(makeOutlet("A1")).resolves.toBeDefined(); // another org
    await expect(
      db.outlet.create({
        data: { organizationId: org.id, code: "A1", name: "Dup", address: "x", stateCode: "27" },
      }),
    ).rejects.toThrow();
  });

  it("makes order clientId an idempotency key", async () => {
    const { org, outlet } = await makeOutlet();
    const order = {
      organizationId: org.id,
      outletId: outlet.id,
      source: "STAFF" as const,
      clientId: "c-1",
    };
    await db.order.create({ data: order });
    await expect(db.order.create({ data: order })).rejects.toThrow();
    expect(await db.order.count()).toBe(1);
  });

  it("never reuses an invoice number within an outlet, and bill clientId is unique", async () => {
    const { org, outlet, device } = await makeOutlet();
    const ids = { organizationId: org.id, outletId: outlet.id, deviceId: device.id };
    await db.bill.create({ data: billData(ids, "A1-2627-D100001", "b-1") });
    await expect(
      db.bill.create({ data: billData(ids, "A1-2627-D100001", "b-2") }),
    ).rejects.toThrow();
    await expect(
      db.bill.create({ data: billData(ids, "A1-2627-D100002", "b-1") }),
    ).rejects.toThrow();
  });

  it("refuses to delete a bill that has payments (bills are immutable records)", async () => {
    const { org, outlet, device } = await makeOutlet();
    const ids = { organizationId: org.id, outletId: outlet.id, deviceId: device.id };
    const bill = await db.bill.create({ data: billData(ids, "A1-2627-D100001", "b-1") });
    await db.payment.create({
      data: { organizationId: org.id, billId: bill.id, mode: "UPI", amount: 10_500 },
    });
    await expect(db.bill.delete({ where: { id: bill.id } })).rejects.toThrow();
    expect(await db.bill.count()).toBe(1);
  });
});
