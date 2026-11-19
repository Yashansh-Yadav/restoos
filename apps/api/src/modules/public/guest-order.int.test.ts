// M5-T6b: guest ordering from the table QR — approval mode (waiting order, seat, floor badge,
// approve → KOT / turn down), direct mode, idempotency, refusals, plan gating and what guests see.
import { seedPlans } from "@restoos/db/testing";
import {
  apiErrorSchema,
  floorSectionSchema,
  floorTableSchema,
  guestOrderResultSchema,
  menuCategorySchema,
  menuItemSchema,
  orderDecisionSchema,
  orderPadSchema,
  outletSettingsSchema,
  publicMenuSchema,
  staffFloorSchema,
  tableOrdersSchema,
  type OutletEvent,
} from "@restoos/shared";
import type { LightMyRequestResponse } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { createAuthHarness } from "../../test/auth-harness";
import { restaurant } from "../../test/restaurant";

type Harness = Awaited<ReturnType<typeof createAuthHarness>>;
let h: Harness;

afterEach(async () => {
  await h.close();
});

const code = (res: LightMyRequestResponse) => apiErrorSchema.parse(res.json()).error.code;
let seq = 0;
const clientId = () => `guest-${Date.now()}-${++seq}`;

async function setup(mode?: "SELF_ORDER_APPROVAL" | "SELF_ORDER") {
  h = await createAuthHarness();
  await seedPlans(h.prisma);
  const r = await restaurant(h);
  const owner = r.owner;
  const hall = floorSectionSchema.parse(
    (await owner("POST", "/api/owner/floor/sections", { name: "Main Hall" })).json(),
  );
  const t1 = floorTableSchema.parse(
    (await owner("POST", "/api/owner/floor/tables", { sectionId: hall.id, label: "T1" })).json(),
  );
  const mains = menuCategorySchema.parse(
    (await owner("POST", "/api/owner/menu/categories", { name: "Mains" })).json(),
  );
  const item = async (body: object) =>
    menuItemSchema.parse(
      (
        await owner("POST", "/api/owner/menu/items", {
          categoryId: mains.id,
          dietType: "VEG",
          taxRateBps: 500,
          ...body,
        })
      ).json(),
    );
  const dal = await item({ name: "Dal Makhani", basePrice: 25_000 });
  const naan = await item({ name: "Butter Naan", basePrice: 6_000 });
  if (mode) {
    const set = await owner("PATCH", "/api/owner/outlet/settings", { orderingMode: mode });
    expect(set.statusCode, set.body).toBe(200);
  }

  // The guest: no cookies, just the table's QR token.
  const guest = (method: "GET" | "POST", path: string, payload?: object) =>
    h.app.inject({
      method,
      url: `/api/public/table/${t1.qrToken}${path}`,
      ...(payload ? { payload } : {}),
    });
  const place = (items: object[], id = clientId()) =>
    guest("POST", "/order", { clientId: id, items });
  const orders = async () => tableOrdersSchema.parse((await guest("GET", "/orders")).json());
  const floor = async () => staffFloorSchema.parse((await owner("GET", "/api/staff/floor")).json());
  const pad = async () =>
    orderPadSchema.parse((await owner("GET", `/api/staff/tables/${t1.id}/order-pad`)).json());
  return { r, owner, t1, dal, naan, guest, place, orders, floor, pad };
}

describe("guest ordering (M5-T6b)", () => {
  it("approval mode: waits for staff, seats the table, Approve & Send makes the KOT", async () => {
    const { owner, t1, dal, naan, place, orders, floor, pad } = await setup("SELF_ORDER_APPROVAL");
    const events: OutletEvent[] = [];
    const off = h.app.events.subscribe((_ctx, e) => {
      events.push(e);
    });

    const id = clientId();
    const res = await place(
      [
        { itemId: dal.id, quantity: 1, unitPrice: 1 }, // a client price is ignored
        { itemId: naan.id, quantity: 2 },
      ],
      id,
    );
    expect(res.statusCode, res.body).toBe(201);
    const placed = guestOrderResultSchema.parse(res.json());
    expect(placed).toMatchObject({ status: "PENDING_APPROVAL", created: true });

    // Saved as a waiting customer order, priced by the server, no kitchen ticket yet.
    const saved = await h.prisma.order.findUniqueOrThrow({
      where: { id: placed.id },
      include: { items: { orderBy: { nameSnapshot: "asc" } }, kots: true },
    });
    expect(saved).toMatchObject({ source: "CUSTOMER", status: "PENDING_APPROVAL" });
    expect(saved.kots).toHaveLength(0);
    expect(saved.items.map((i) => [i.nameSnapshot, i.unitPrice, i.quantity, i.status])).toEqual([
      ["Butter Naan", 6_000, 2, "NEW"],
      ["Dal Makhani", 25_000, 1, "NEW"],
    ]);

    // The free table was seated so the floor shows a waiting order.
    const f = await floor();
    const tile = f.sections.flatMap((s) => s.tables).find((t) => t.id === t1.id);
    expect(tile).toMatchObject({ status: "OCCUPIED", pendingApproval: true });
    expect(events.map((e) => e.name)).toEqual(["table.statusChanged", "order.pendingApproval"]);

    // A retry of the same Place Order changes nothing.
    const again = await place([{ itemId: dal.id, quantity: 1 }], id);
    expect(again.statusCode).toBe(200);
    expect(guestOrderResultSchema.parse(again.json())).toMatchObject({
      id: placed.id,
      created: false,
    });
    expect(await h.prisma.order.count()).toBe(1);

    // The guest sees it waiting; staff see it on the order screen, not as "sent".
    expect((await orders()).orders.map((o) => o.state)).toEqual(["WAITING"]);
    const p = await pad();
    expect(p.sent).toEqual([]);
    expect(p.pending.map((o) => o.lines.map((l) => [l.name, l.quantity]))).toEqual([
      [
        ["Dal Makhani", 1],
        ["Butter Naan", 2],
      ],
    ]);

    // Approve & Send: KOT #1, table Ordered, items Sent; a second tap is refused.
    events.length = 0;
    const ok = await owner("POST", `/api/staff/orders/${placed.id}/approve`);
    expect(ok.statusCode, ok.body).toBe(200);
    expect(orderDecisionSchema.parse(ok.json())).toMatchObject({
      status: "OPEN",
      kot: { number: 1 },
    });
    const twice = await owner("POST", `/api/staff/orders/${placed.id}/approve`);
    expect(code(twice)).toBe("ORDER_CHANGED");
    expect(events.map((e) => e.name)).toEqual([
      "table.statusChanged",
      "order.statusChanged",
      "kot.created",
    ]);
    off();
    const after = await floor();
    expect(after.sections.flatMap((s) => s.tables).find((t) => t.id === t1.id)).toMatchObject({
      status: "ORDERED",
      pendingApproval: false,
    });
    expect(
      (await h.prisma.orderItem.findMany({ where: { orderId: placed.id } })).map((i) => i.status),
    ).toEqual(["SENT", "SENT"]);
    expect((await orders()).orders.map((o) => o.state)).toEqual(["SENT"]);
    expect((await pad()).sent).toHaveLength(2);
  });

  it("staff can turn an order down; the guest sees why; the kitchen can't decide", async () => {
    const { r, dal, place, orders, pad } = await setup("SELF_ORDER_APPROVAL");
    const first = guestOrderResultSchema.parse(
      (await place([{ itemId: dal.id, quantity: 1 }])).json(),
    );
    const second = guestOrderResultSchema.parse(
      (await place([{ itemId: dal.id, quantity: 3 }])).json(),
    );

    const imran = await r.addStaff("Imran", "KITCHEN", "5938");
    const kitchen = await r.signedInTablet(imran.id, "5938");
    expect((await kitchen.call("POST", `/api/staff/orders/${first.id}/approve`)).statusCode).toBe(
      403,
    );

    const rahul = await r.addStaff("Rahul", "BUTLER", "4827");
    const butler = await r.signedInTablet(rahul.id, "4827");
    const no = await butler.call("POST", `/api/staff/orders/${first.id}/reject`, {
      reason: "Item not available",
    });
    expect(no.statusCode, no.body).toBe(200);
    expect(orderDecisionSchema.parse(no.json())).toMatchObject({ status: "CANCELLED" });
    const silent = await butler.call("POST", `/api/staff/orders/${second.id}/reject`, {});
    expect(silent.statusCode, silent.body).toBe(200);

    const items = await h.prisma.orderItem.findMany({ where: { orderId: first.id } });
    expect(items.map((i) => [i.status, i.voidReason, i.voidedById])).toEqual([
      ["VOIDED", "Item not available", rahul.id],
    ]);
    expect((await orders()).orders.map((o) => [o.state, o.reason])).toEqual([
      ["NOT_ACCEPTED", "Item not available"],
      ["NOT_ACCEPTED", null],
    ]);
    const p = await pad();
    expect(p.pending).toEqual([]);
    expect(p.sent).toEqual([]);
  });

  it("direct mode sends to the kitchen at once", async () => {
    const { t1, dal, place, orders } = await setup("SELF_ORDER");
    const res = await place([{ itemId: dal.id, quantity: 2 }]);
    expect(res.statusCode, res.body).toBe(201);
    const placed = guestOrderResultSchema.parse(res.json());
    expect(placed.status).toBe("OPEN");
    const kot = await h.prisma.kot.findFirstOrThrow({ where: { orderId: placed.id } });
    expect(kot.number).toBe(1);
    expect((await h.prisma.diningTable.findUniqueOrThrow({ where: { id: t1.id } })).status).toBe(
      "ORDERED",
    );
    expect((await orders()).orders.map((o) => o.state)).toEqual(["SENT"]);
  });

  it("refuses when ordering is off, items are out, the table is paid, or the plan lacks it", async () => {
    const { r, owner, t1, dal, naan, guest, place, orders } = await setup();

    // Menu only (the default).
    expect(code(await place([{ itemId: dal.id, quantity: 1 }]))).toBe("ORDERING_OFF");
    expect((await orders()).orderingMode).toBe("VIEW_ONLY");

    await owner("PATCH", "/api/owner/outlet/settings", { orderingMode: "SELF_ORDER_APPROVAL" });
    // Out of stock.
    await owner("PUT", `/api/staff/menu/items/${naan.id}/stock`, { inStock: false });
    const out = await place([{ itemId: naan.id, quantity: 1 }]);
    expect(out.statusCode).toBe(409);
    expect(code(out)).toBe("ITEMS_UNAVAILABLE");
    // Paid table.
    await h.prisma.diningTable.update({ where: { id: t1.id }, data: { status: "PAID" } });
    expect(code(await place([{ itemId: dal.id, quantity: 1 }]))).toBe("TABLE_NOT_ORDERING");
    await h.prisma.diningTable.update({ where: { id: t1.id }, data: { status: "FREE" } });
    // Bad input.
    expect((await place([])).statusCode).toBe(400);

    // Starter plan: the menu says menu-only, orders are refused, the setting can't be turned on.
    const starter = await h.prisma.plan.findFirstOrThrow({ where: { key: "STARTER" } });
    await h.prisma.subscription.create({
      data: {
        organizationId: r.organizationId,
        outletId: r.outletId,
        planId: starter.id,
        interval: "MONTHLY",
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    const menu = publicMenuSchema.parse((await guest("GET", "")).json());
    expect(menu.outlet.orderingMode).toBe("VIEW_ONLY");
    expect(code(await place([{ itemId: dal.id, quantity: 1 }]))).toBe("ORDERING_OFF");
    const direct = await owner("PATCH", "/api/owner/outlet/settings", {
      orderingMode: "SELF_ORDER",
    });
    expect(direct.statusCode).toBe(403);
    expect(code(direct)).toBe("FEATURE_NOT_IN_PLAN");
    // Turning it off is always allowed.
    const off = await owner("PATCH", "/api/owner/outlet/settings", { orderingMode: "VIEW_ONLY" });
    expect(outletSettingsSchema.parse(off.json()).orderingMode).toBe("VIEW_ONLY");

    // A rotated or unknown QR code.
    const gone = await h.app.inject({
      method: "POST",
      url: "/api/public/table/AAAAAAAAAAAAAAAAAAAAAA/order",
      payload: { clientId: clientId(), items: [{ itemId: dal.id, quantity: 1 }] },
    });
    expect(code(gone)).toBe("TABLE_NOT_FOUND");
  });

  it("guests only see this sitting's orders", async () => {
    const { owner, t1, dal, place, orders } = await setup("SELF_ORDER");
    await place([{ itemId: dal.id, quantity: 1 }]);
    expect((await orders()).orders).toHaveLength(1);
    // The party leaves: session closed (bills arrive in M7; close it directly here).
    await h.prisma.tableSession.updateMany({
      where: { tableId: t1.id, closedAt: null },
      data: { closedAt: new Date() },
    });
    await h.prisma.diningTable.update({ where: { id: t1.id }, data: { status: "FREE" } });
    expect((await orders()).orders).toEqual([]);
    void owner;
  });
});
