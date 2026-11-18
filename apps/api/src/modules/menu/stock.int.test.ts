// M2-T4: one-tap stock toggle — kitchen/cashier/manager/owner, not butlers; emits menu.stockChanged.
import { seedPlans } from "@restoos/db/testing";
import {
  apiErrorSchema,
  menuCategorySchema,
  menuItemSchema,
  stockListSchema,
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

async function setup() {
  h = await createAuthHarness();
  await seedPlans(h.prisma);
  const r = await restaurant(h);
  const menu = (method: "POST" | "PATCH", url: string, body: object) =>
    r.owner(method, `/api/owner/menu${url}`, body);
  const mains = menuCategorySchema.parse(
    (await menu("POST", "/categories", { name: "Mains" })).json(),
  );
  const item = (name: string, categoryId = mains.id) =>
    menu("POST", "/items", {
      categoryId,
      name,
      dietType: "VEG",
      basePrice: 20_000,
      taxRateBps: 500,
    }).then((res) => menuItemSchema.parse(res.json()));
  const paneer = await item("Paneer Tikka");
  const dal = await item("Dal Makhani");
  return { r, menu, mains, item, paneer, dal };
}

describe("stock toggle", () => {
  it("kitchen marks an item out of stock and back; menu.stockChanged is published", async () => {
    const { r, paneer } = await setup();
    const events: OutletEvent[] = [];
    const off = h.app.events.subscribe((_ctx, e) => {
      events.push(e);
    });

    const k = await r.addStaff("Imran", "KITCHEN", "4001");
    const kitchen = await r.signedInTablet(k.id, "4001");
    const out = await kitchen.call("PUT", `/api/staff/menu/items/${paneer.id}/stock`, {
      inStock: false,
    });
    expect(out.statusCode, out.body).toBe(200);
    expect(out.json()).toEqual({ id: paneer.id, inStock: false });
    // Same value again is fine (double tap / two devices).
    expect(
      (await kitchen.call("PUT", `/api/staff/menu/items/${paneer.id}/stock`, { inStock: false }))
        .statusCode,
    ).toBe(200);
    off();

    expect(events).toContainEqual({
      name: "menu.stockChanged",
      payload: { outletId: r.outletId, itemId: paneer.id, inStock: false },
    });
    expect(events.some((e) => e.name === "menu.changed")).toBe(true);
    expect((await h.prisma.menuItem.findUniqueOrThrow({ where: { id: paneer.id } })).inStock).toBe(
      false,
    );

    // Owner turns it back on from the menu screen (outlet in the header).
    const back = await r.owner("PUT", `/api/staff/menu/items/${paneer.id}/stock`, {
      inStock: true,
    });
    expect(back.json()).toEqual({ id: paneer.id, inStock: true });
  });

  it("cashier and manager can; a butler can't", async () => {
    const { r, dal } = await setup();
    for (const [name, role, pin] of [
      ["Priya", "CASHIER", "4827"],
      ["Meera", "MANAGER", "905172"],
    ] as const) {
      const s = await r.addStaff(name, role, pin);
      const tablet = await r.signedInTablet(s.id, pin);
      expect(
        (await tablet.call("PUT", `/api/staff/menu/items/${dal.id}/stock`, { inStock: false }))
          .statusCode,
      ).toBe(200);
    }
    const b = await r.addStaff("Arjun", "BUTLER", "3001");
    const butler = await r.signedInTablet(b.id, "3001");
    const denied = await butler.call("PUT", `/api/staff/menu/items/${dal.id}/stock`, {
      inStock: true,
    });
    expect([denied.statusCode, code(denied)]).toEqual([403, "FORBIDDEN"]);
    expect((await butler.call("GET", "/api/staff/menu/stock")).statusCode).toBe(403);
  });

  it("lists visible items only, grouped and ordered like the menu", async () => {
    const { r, menu, item, paneer } = await setup();
    const hiddenItem = await item("Old Special");
    await menu("PATCH", `/items/${hiddenItem.id}`, { isActive: false });
    const closed = menuCategorySchema.parse(
      (await menu("POST", "/categories", { name: "Seasonal" })).json(),
    );
    await item("Mango Lassi", closed.id);
    await menu("PATCH", `/categories/${closed.id}`, { isActive: false });
    await r.owner("PUT", `/api/staff/menu/items/${paneer.id}/stock`, { inStock: false });

    const list = stockListSchema.parse((await r.owner("GET", "/api/staff/menu/stock")).json());
    expect(list.categories.map((c) => [c.name, c.items.map((i) => [i.name, i.inStock])])).toEqual([
      [
        "Mains",
        [
          ["Paneer Tikka", false],
          ["Dal Makhani", true],
        ],
      ],
    ]);
  });

  it("can't touch another restaurant's items, and owners must pick an outlet", async () => {
    const { paneer } = await setup();
    const noOutlet = await h.request("GET", "/api/staff/menu/stock");
    expect([noOutlet.statusCode, code(noOutlet)]).toEqual([400, "OUTLET_REQUIRED"]);

    h.clearCookies();
    const other = await restaurant(h, "+919876500002");
    const res = await other.owner("PUT", `/api/staff/menu/items/${paneer.id}/stock`, {
      inStock: false,
    });
    expect([res.statusCode, code(res)]).toEqual([404, "NOT_FOUND"]);
    expect((await h.prisma.menuItem.findUniqueOrThrow({ where: { id: paneer.id } })).inStock).toBe(
      true,
    );
  });
});
