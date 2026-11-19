// M5-T1: the staff order pad and "Send to kitchen" — server pricing + snapshots, sizes and
// add-ons, the table seated on the first send, clientId idempotency, stock and permission checks.
import { seedPlans } from "@restoos/db/testing";
import {
  addOnGroupSchema,
  apiErrorSchema,
  createdOrderSchema,
  floorSectionSchema,
  floorTableSchema,
  menuCategorySchema,
  menuItemSchema,
  orderPadSchema,
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
const clientId = () => `test-client-${Date.now()}-${++seq}`;

async function setup() {
  h = await createAuthHarness();
  await seedPlans(h.prisma);
  const r = await restaurant(h);
  const owner = (method: "GET" | "POST" | "PUT", url: string, body?: object) =>
    r.owner(method, url, body);

  const hall = floorSectionSchema.parse(
    (await owner("POST", "/api/owner/floor/sections", { name: "Main Hall" })).json(),
  );
  const table = async (label: string) =>
    floorTableSchema.parse(
      (await owner("POST", "/api/owner/floor/tables", { sectionId: hall.id, label })).json(),
    );
  const t1 = await table("T1");
  const t2 = await table("T2");

  const mains = menuCategorySchema.parse(
    (await owner("POST", "/api/owner/menu/categories", { name: "Mains" })).json(),
  );
  const extras = addOnGroupSchema.parse(
    (
      await owner("POST", "/api/owner/menu/addon-groups", {
        name: "Extras",
        minSelect: 0,
        maxSelect: 2,
        addOns: [
          { name: "Cheese", price: 3_000 },
          { name: "Butter", price: 2_000 },
        ],
      })
    ).json(),
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
  const dal = await item({ name: "Dal Makhani", code: "12", basePrice: 25_000 });
  const paneer = await item({
    name: "Paneer Tikka",
    basePrice: 20_000,
    variants: [
      { name: "Half", price: 14_000 },
      { name: "Full", price: 24_000 },
    ],
    addOnGroupIds: [extras.id],
  });
  const soda = await item({ name: "Soda", basePrice: 6_000, taxRateBps: 1_800 });
  const full = paneer.variants.find((v) => v.name === "Full")?.id ?? "";
  const cheese = extras.addOns.find((a) => a.name === "Cheese")?.id ?? "";

  const send = (body: object) => owner("POST", "/api/staff/orders", body);
  const pad = async (tableId: string) =>
    orderPadSchema.parse((await owner("GET", `/api/staff/tables/${tableId}/order-pad`)).json());
  return { r, owner, t1, t2, dal, paneer, soda, full, cheese, send, pad };
}

describe("staff ordering (M5-T1)", () => {
  it("sends an order: server prices, size + add-on snapshot, table seated, events", async () => {
    const { r, t1, dal, paneer, full, cheese, send, pad } = await setup();
    const events: OutletEvent[] = [];
    const off = h.app.events.subscribe((_ctx, e) => {
      events.push(e);
    });

    const res = await send({
      clientId: clientId(),
      tableId: t1.id,
      items: [
        { itemId: dal.id, quantity: 2, unitPrice: 1 }, // a client price is ignored
        { itemId: paneer.id, variantId: full, addOnIds: [cheese], quantity: 1, note: "less spicy" },
      ],
    });
    expect(res.statusCode, res.body).toBe(201);
    const order = createdOrderSchema.parse(res.json());
    expect(order).toMatchObject({ tableId: t1.id, itemCount: 2, created: true });

    const rows = await h.prisma.orderItem.findMany({
      where: { orderId: order.id },
      orderBy: { nameSnapshot: "asc" },
    });
    expect(rows.map((i) => [i.nameSnapshot, i.unitPrice, i.quantity, i.status, i.note])).toEqual([
      ["Dal Makhani", 25_000, 2, "SENT", null],
      ["Paneer Tikka (Full)", 27_000, 1, "SENT", "less spicy"],
    ]);
    expect(rows[1]?.addOns).toEqual([{ addOnId: cheese, name: "Cheese", price: 3_000 }]);

    // The table was free: the send seated it and opened a session the order belongs to.
    const table = await h.prisma.diningTable.findUniqueOrThrow({ where: { id: t1.id } });
    expect(table.status).toBe("ORDERED");
    const saved = await h.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { tableSession: true },
    });
    expect(saved).toMatchObject({ source: "STAFF", status: "OPEN", createdById: null });
    expect(saved.tableSession?.tableId).toBe(t1.id);
    expect(saved.tableSession?.closedAt).toBeNull();

    expect(events.map((e) => e.name)).toEqual([
      "table.statusChanged",
      "order.created",
      "kot.created",
    ]);
    expect(events[1]?.payload).toEqual({ outletId: r.outletId, orderId: order.id, tableId: t1.id });

    // A second send keeps the same guests' session; the pad shows everything sent.
    await send({ clientId: clientId(), tableId: t1.id, items: [{ itemId: dal.id, quantity: 1 }] });
    expect(await h.prisma.tableSession.count({ where: { tableId: t1.id } })).toBe(1);
    const p = await pad(t1.id);
    expect(p.table).toMatchObject({ label: "T1", status: "ORDERED" });
    expect(p.sent.map((l) => [l.name, l.quantity, l.addOns])).toEqual([
      ["Dal Makhani", 2, []],
      ["Paneer Tikka (Full)", 1, ["Cheese"]],
      ["Dal Makhani", 1, []],
    ]);
    off();
  });

  it("is idempotent on clientId and refuses bad choices", async () => {
    const { t1, t2, dal, paneer, soda, full, send, owner } = await setup();
    const body = { clientId: clientId(), tableId: t1.id, items: [{ itemId: dal.id, quantity: 1 }] };
    const first = await send(body);
    expect(first.statusCode).toBe(201);
    const again = await send(body);
    expect(again.statusCode).toBe(200);
    expect(createdOrderSchema.parse(again.json())).toMatchObject({
      id: createdOrderSchema.parse(first.json()).id,
      created: false,
    });
    expect(await h.prisma.order.count()).toBe(1);
    expect(await h.prisma.orderItem.count()).toBe(1);
    const reused = await send({ ...body, tableId: t2.id });
    expect([reused.statusCode, code(reused)]).toEqual([409, "CLIENT_ID_REUSED"]);

    const noSize = await send({
      clientId: clientId(),
      tableId: t2.id,
      items: [{ itemId: paneer.id, quantity: 1 }],
    });
    expect([noSize.statusCode, code(noSize)]).toEqual([400, "INVALID_SELECTION"]);
    const badAddOn = await send({
      clientId: clientId(),
      tableId: t2.id,
      items: [{ itemId: paneer.id, variantId: full, addOnIds: ["nope"], quantity: 1 }],
    });
    expect(code(badAddOn)).toBe("INVALID_SELECTION");

    await owner("PUT", `/api/staff/menu/items/${soda.id}/stock`, { inStock: false });
    const out = await send({
      clientId: clientId(),
      tableId: t2.id,
      items: [{ itemId: soda.id, quantity: 1 }],
    });
    expect([out.statusCode, code(out)]).toEqual([409, "ITEMS_UNAVAILABLE"]);
    expect(apiErrorSchema.parse(out.json()).error.details).toEqual({ items: ["Soda"] });

    // Nothing above touched T2.
    expect((await h.prisma.diningTable.findUniqueOrThrow({ where: { id: t2.id } })).status).toBe(
      "FREE",
    );
  });

  it("puts popular items first, records the butler, keeps the kitchen and others out", async () => {
    const { r, t1, dal, soda, pad } = await setup();
    const rahul = await r.addStaff("Rahul", "BUTLER", "4827");
    const tablet = await r.signedInTablet(rahul.id, "4827");
    const sent = await tablet.call("POST", "/api/staff/orders", {
      clientId: clientId(),
      tableId: t1.id,
      items: [{ itemId: soda.id, quantity: 5 }],
    });
    expect(sent.statusCode, sent.body).toBe(201);
    expect(
      (await h.prisma.order.findFirstOrThrow({ select: { createdById: true } })).createdById,
    ).toBe(rahul.id);

    const p = await pad(t1.id);
    expect(p.topItemIds[0]).toBe(soda.id); // ordered most lately
    expect(p.topItemIds).toContain(dal.id); // then the menu fills the rest
    const codes = p.categories.flatMap((c) => c.items.map((i) => i.code));
    expect(codes).toContain("12");

    const imran = await r.addStaff("Imran", "KITCHEN", "5938");
    const kitchen = await r.signedInTablet(imran.id, "5938");
    expect((await kitchen.call("GET", `/api/staff/tables/${t1.id}/order-pad`)).statusCode).toBe(
      403,
    );
    expect(
      (
        await kitchen.call("POST", "/api/staff/orders", {
          clientId: clientId(),
          tableId: t1.id,
          items: [{ itemId: dal.id, quantity: 1 }],
        })
      ).statusCode,
    ).toBe(403);

    h.clearCookies();
    const other = await restaurant(h, "+919876500002");
    const theirs = await other.owner("POST", "/api/staff/orders", {
      clientId: clientId(),
      tableId: t1.id,
      items: [{ itemId: dal.id, quantity: 1 }],
    });
    expect(code(theirs)).toBe("NOT_FOUND");
  });
});
