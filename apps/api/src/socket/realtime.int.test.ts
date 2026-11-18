// M4-T2: published events reach the right rooms live; signed-out staff and rotated QR codes are
// cut off; workers publish through Redis to the same rooms.
import { seedPlans } from "@restoos/db/testing";
import {
  floorSectionSchema,
  floorTableSchema,
  menuCategorySchema,
  menuItemSchema,
  type OutletEventName,
  type OutletEvents,
} from "@restoos/shared";
import { afterEach, describe, expect, it } from "vitest";
import { createAuthHarness } from "../test/auth-harness";
import { restaurant } from "../test/restaurant";
import { cookieOf, socketClients, type TestSocket } from "../test/sockets";
import { createWorkerEventBus } from "./emitter";

type Harness = Awaited<ReturnType<typeof createAuthHarness>>;
let h: Harness;
const clients = socketClients();

afterEach(async () => {
  clients.closeAll();
  await h.close();
});

/** Everything a socket receives, by event name. */
function recorder(socket: TestSocket) {
  const got: { name: OutletEventName; payload: unknown }[] = [];
  socket.onAny((name: OutletEventName, payload: unknown) => got.push({ name, payload }));
  return {
    got,
    of: <K extends OutletEventName>(name: K) =>
      got.filter((g) => g.name === name).map((g) => g.payload as OutletEvents[K]),
  };
}

async function setup() {
  h = await createAuthHarness();
  await seedPlans(h.prisma);
  await h.app.listen({ port: 0, host: "127.0.0.1" });
  const r = await restaurant(h);
  const ownerCookie = cookieOf(h.jar);
  const floorApi = (url: string, body: object) => r.owner("POST", `/api/owner/floor${url}`, body);
  const hall = floorSectionSchema.parse(
    (await floorApi("/sections", { name: "Main Hall" })).json(),
  );
  const t1 = floorTableSchema.parse(
    (await floorApi("/tables", { sectionId: hall.id, label: "T1" })).json(),
  );
  const mains = menuCategorySchema.parse(
    (await r.owner("POST", "/api/owner/menu/categories", { name: "Mains" })).json(),
  );
  const paneer = menuItemSchema.parse(
    (
      await r.owner("POST", "/api/owner/menu/items", {
        categoryId: mains.id,
        name: "Paneer Tikka",
        dietType: "VEG",
        basePrice: 20_000,
        taxRateBps: 500,
      })
    ).json(),
  );

  const rahul = await r.addStaff("Rahul", "BUTLER", "4827");
  const rahulTablet = await r.signedInTablet(rahul.id, "4827");
  const staff = await clients.connect(h.app, { cookie: cookieOf(rahulTablet.jar) });
  const owner = await clients.connect(h.app, {
    cookie: ownerCookie,
    auth: { outletId: r.outletId },
  });
  const guest = await clients.connect(h.app, { auth: { qrToken: t1.qrToken } });
  return { r, hall, t1, paneer, rahul, rahulTablet, staff, owner, guest };
}

describe("live events (M4-T2)", () => {
  it("delivers each write's event to its rooms only", async () => {
    const { r, hall, t1, paneer, staff, owner, guest } = await setup();
    const s = recorder(staff);
    const o = recorder(owner);
    const g = recorder(guest);

    // Another restaurant listening hears nothing of ours.
    const ours = new Map(h.jar);
    h.clearCookies();
    const other = await restaurant(h, "+919876500002");
    const theirs = recorder(
      await clients.connect(h.app, { cookie: cookieOf(h.jar), auth: { outletId: other.outletId } }),
    );
    h.jar.clear();
    for (const [k, v] of ours) h.jar.set(k, v);

    // Stock: staff, owner and customers.
    const stock = await r.owner("PUT", `/api/staff/menu/items/${paneer.id}/stock`, {
      inStock: false,
    });
    expect(stock.statusCode, stock.body).toBe(200);
    const expected = { outletId: r.outletId, itemId: paneer.id, inStock: false };
    await expect.poll(() => g.of("menu.stockChanged")).toEqual([expected]);
    await expect.poll(() => s.of("menu.stockChanged")).toEqual([expected]);
    await expect.poll(() => o.of("menu.stockChanged")).toEqual([expected]);

    // Table status: staff and owner, not the guest.
    await r.owner("POST", `/api/staff/tables/${t1.id}/status`, { event: "seat" });
    await expect
      .poll(() => s.of("table.statusChanged"))
      .toEqual([{ outletId: r.outletId, tableId: t1.id, status: "OCCUPIED" }]);
    await expect.poll(() => o.of("table.statusChanged")).toHaveLength(1);

    // Floor edit: staff and owner, not the guest.
    await r.owner("PATCH", `/api/owner/floor/sections/${hall.id}`, { name: "Main Room" });
    await expect.poll(() => s.of("floor.changed")).toEqual([{ outletId: r.outletId }]);

    // Give stragglers a moment, then check nothing leaked.
    await new Promise((resolve) => setTimeout(resolve, 300));
    // (A stock toggle also publishes menu.changed — M2-T4 — so caches and menus refresh.)
    expect(g.got.map((e) => e.name)).toEqual(["menu.stockChanged", "menu.changed"]);
    expect(theirs.got).toEqual([]);
  });

  it("cuts off staff who sign out and phones on a rotated QR code", async () => {
    const { r, t1, rahulTablet, staff, guest } = await setup();
    const meera = await r.addStaff("Meera", "MANAGER", "905172");
    const manager = await clients.connect(h.app, {
      cookie: cookieOf((await r.signedInTablet(meera.id, "905172")).jar),
    });
    const reasons: Record<string, string> = {};
    staff.on("disconnect", (reason) => (reasons.staff = reason));
    guest.on("disconnect", (reason) => (reasons.guest = reason));
    manager.on("disconnect", (reason) => (reasons.manager = reason));

    // Rahul ends his shift: his socket goes, Meera's stays.
    expect((await rahulTablet.call("POST", "/api/staff/shift/end")).statusCode).toBe(204);
    await expect.poll(() => reasons.staff).toBe("io server disconnect");

    // New QR for T1: the phone on the old code is cut off and can't come back.
    await r.owner("POST", `/api/owner/floor/tables/${t1.id}/rotate-qr`);
    await expect.poll(() => reasons.guest).toBe("io server disconnect");
    await expect(clients.connect(h.app, { auth: { qrToken: t1.qrToken } })).rejects.toThrow(
      "TABLE_NOT_FOUND",
    );

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(reasons.manager).toBeUndefined();
    expect(manager.connected).toBe(true);
  });

  it("lets workers publish through Redis to the same rooms", async () => {
    const { r, staff, guest } = await setup();
    const s = recorder(staff);
    const g = recorder(guest);
    const worker = createWorkerEventBus(h.redis.duplicate());
    const ctx = {
      organizationId: r.organizationId,
      outletId: r.outletId,
      actor: { kind: "system" as const, reason: "test" },
    };
    await worker.publishEvent(ctx, "menu.changed", { outletId: r.outletId });
    await expect.poll(() => s.of("menu.changed")).toEqual([{ outletId: r.outletId }]);
    await expect.poll(() => g.of("menu.changed")).toEqual([{ outletId: r.outletId }]);
  });
});
