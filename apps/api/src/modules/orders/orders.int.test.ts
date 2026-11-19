// M5-T1: the staff order pad and "Send to kitchen" — server pricing + snapshots, sizes and
// add-ons, the table seated on the first send, clientId idempotency, stock and permission checks.
// M5-T5: voiding sent items (whole or partial), the guards, the audit row and who may void.
import { seedPlans } from "@restoos/db/testing";
import {
  addOnGroupSchema,
  apiErrorSchema,
  createdOrderSchema,
  floorSectionSchema,
  floorTableSchema,
  kitchenBoardSchema,
  menuCategorySchema,
  menuItemSchema,
  orderPadSchema,
  voidedItemSchema,
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

describe("voiding sent items (M5-T5)", () => {
  const items = async (orderId: string) =>
    h.prisma.orderItem.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });

  it("voids part of a line (split) and then a whole line; audited, evented, kitchen sees it", async () => {
    const { r, t1, dal, soda, send, pad } = await setup();
    const order = createdOrderSchema.parse(
      (
        await send({
          clientId: clientId(),
          tableId: t1.id,
          items: [
            { itemId: dal.id, quantity: 3 },
            { itemId: soda.id, quantity: 1 },
          ],
        })
      ).json(),
    );
    const lines = await items(order.id);
    const dalLine = lines.find((l) => l.nameSnapshot === "Dal Makhani");
    const sodaLine = lines.find((l) => l.nameSnapshot === "Soda");
    if (!dalLine || !sodaLine) throw new Error("lines missing");
    const meena = await r.addStaff("Meena", "MANAGER", "6150");
    const manager = await r.signedInTablet(meena.id, "6150");
    const events: OutletEvent[] = [];
    const off = h.app.events.subscribe((_ctx, e) => {
      events.push(e);
    });

    // 3 × Dal → void 1: the line keeps 2, a VOIDED copy of 1 carries the same snapshots.
    const part = await manager.call("POST", `/api/staff/order-items/${dalLine.id}/void`, {
      quantity: 1,
      fromQuantity: 3,
      reason: "Guest changed mind",
    });
    expect(part.statusCode, part.body).toBe(200);
    const voided = voidedItemSchema.parse(part.json());
    expect(voided).toMatchObject({ quantity: 1, remaining: 2 });
    expect(voided.id).not.toBe(dalLine.id);
    const after = await items(order.id);
    const kept = after.find((i) => i.id === dalLine.id);
    const copy = after.find((i) => i.id === voided.id);
    expect(kept).toMatchObject({ quantity: 2, status: "SENT", voidReason: null });
    expect(copy).toMatchObject({
      quantity: 1,
      status: "VOIDED",
      nameSnapshot: "Dal Makhani",
      unitPrice: dalLine.unitPrice,
      taxRateBps: dalLine.taxRateBps,
      kotId: dalLine.kotId,
      voidReason: "Guest changed mind",
      voidedById: meena.id,
    });
    expect(copy?.voidedAt).toBeInstanceOf(Date);

    // The same request again (a retry) no longer matches the quantity seen: nothing doubles.
    const retry = await manager.call("POST", `/api/staff/order-items/${dalLine.id}/void`, {
      quantity: 1,
      fromQuantity: 3,
      reason: "Guest changed mind",
    });
    expect(retry.statusCode).toBe(409);
    expect(code(retry)).toBe("LINE_CHANGED");

    // Whole line: the soda flips to VOIDED; voiding it again is refused.
    const whole = await manager.call("POST", `/api/staff/order-items/${sodaLine.id}/void`, {
      quantity: 1,
      fromQuantity: 1,
      reason: "Wrong item entered",
    });
    expect(whole.statusCode, whole.body).toBe(200);
    expect(voidedItemSchema.parse(whole.json())).toEqual({
      id: sodaLine.id,
      quantity: 1,
      remaining: 0,
    });
    const again = await manager.call("POST", `/api/staff/order-items/${sodaLine.id}/void`, {
      quantity: 1,
      fromQuantity: 1,
      reason: "Wrong item entered",
    });
    expect(code(again)).toBe("ALREADY_VOIDED");
    off();

    // Audited in the same transaction, one row per void, with what and why.
    const audits = await h.prisma.auditLog.findMany({
      where: { action: "order.voidItem" },
      orderBy: { createdAt: "asc" },
    });
    expect(audits.map((a) => [a.entityId, a.actorType, a.actorId])).toEqual([
      [voided.id, "EMPLOYEE", meena.id],
      [sodaLine.id, "EMPLOYEE", meena.id],
    ]);
    expect(audits[0]?.data).toMatchObject({
      sourceItemId: dalLine.id,
      name: "Dal Makhani",
      quantity: 1,
      reason: "Guest changed mind",
      statusBefore: "SENT",
    });
    expect(events.filter((e) => e.name === "order.itemVoided").map((e) => e.payload)).toEqual([
      expect.objectContaining({ tableId: t1.id, kotId: dalLine.kotId, itemId: voided.id }),
      expect.objectContaining({ tableId: t1.id, kotId: sodaLine.kotId, itemId: sodaLine.id }),
    ]);

    // The order pad lists the voids with their reasons; the kitchen ticket shows them too.
    const p = await pad(t1.id);
    expect(p.sent.map((l) => [l.name, l.quantity, l.status, l.voidReason])).toEqual(
      expect.arrayContaining([
        ["Dal Makhani", 2, "SENT", null],
        ["Soda", 1, "VOIDED", "Wrong item entered"],
        ["Dal Makhani", 1, "VOIDED", "Guest changed mind"],
      ]),
    );
    expect(p.sent).toHaveLength(3);
    const board = kitchenBoardSchema.parse((await r.owner("GET", "/api/staff/kitchen")).json());
    expect(board.kots).toHaveLength(1);
    expect(board.kots[0]?.items.map((i) => [i.name, i.quantity, i.status])).toEqual(
      expect.arrayContaining([
        ["Dal Makhani", 2, "SENT"],
        ["Dal Makhani", 1, "VOIDED"],
        ["Soda", 1, "VOIDED"],
      ]),
    );

    // Void what is left: nothing to cook, so the ticket leaves the board.
    const rest = await manager.call("POST", `/api/staff/order-items/${dalLine.id}/void`, {
      quantity: 2,
      fromQuantity: 2,
      reason: "Out of stock",
    });
    expect(rest.statusCode, rest.body).toBe(200);
    const empty = kitchenBoardSchema.parse((await r.owner("GET", "/api/staff/kitchen")).json());
    expect(empty.kots).toHaveLength(0);
  });

  it("checks the input, who may void, and keeps other restaurants out", async () => {
    const { r, t1, dal, send } = await setup();
    const order = createdOrderSchema.parse(
      (
        await send({
          clientId: clientId(),
          tableId: t1.id,
          items: [{ itemId: dal.id, quantity: 2 }],
        })
      ).json(),
    );
    const [line] = await items(order.id);
    if (!line) throw new Error("line missing");
    const url = `/api/staff/order-items/${line.id}/void`;

    // Bad input: no reason, more than the line has.
    expect(
      (await r.owner("POST", url, { quantity: 1, fromQuantity: 2, reason: "  " })).statusCode,
    ).toBe(400);
    expect(
      (await r.owner("POST", url, { quantity: 3, fromQuantity: 2, reason: "Quality issue" }))
        .statusCode,
    ).toBe(400);

    // Butlers and the kitchen can not void.
    const rahul = await r.addStaff("Rahul", "BUTLER", "4827");
    const butler = await r.signedInTablet(rahul.id, "4827");
    const body = { quantity: 1, fromQuantity: 2, reason: "Quality issue" };
    expect((await butler.call("POST", url, body)).statusCode).toBe(403);
    const imran = await r.addStaff("Imran", "KITCHEN", "5938");
    const kitchen = await r.signedInTablet(imran.id, "5938");
    expect((await kitchen.call("POST", url, body)).statusCode).toBe(403);

    // Another restaurant (its owner): not found.
    const ownerJar = new Map(h.jar);
    h.clearCookies();
    const other = await restaurant(h, "+919876500002");
    expect(code(await other.owner("POST", url, body))).toBe("NOT_FOUND");
    expect((await h.prisma.orderItem.findUniqueOrThrow({ where: { id: line.id } })).quantity).toBe(
      2,
    );

    // The owner (no employee id) may void.
    h.clearCookies();
    for (const [k, v] of ownerJar) h.jar.set(k, v);
    const ok = await r.owner("POST", url, body);
    expect(ok.statusCode, ok.body).toBe(200);
    const split = await h.prisma.orderItem.findFirstOrThrow({ where: { status: "VOIDED" } });
    expect(split.voidedById).toBeNull();
  });
});
