// M5-T2: every send becomes a KOT with only its new items, numbered per outlet per business day
// (atomic counter: concurrent sends never collide), published as kot.created.
import { seedPlans } from "@restoos/db/testing";
import {
  createdOrderSchema,
  floorSectionSchema,
  floorTableSchema,
  menuCategorySchema,
  menuItemSchema,
  type OutletEvent,
} from "@restoos/shared";
import { afterEach, describe, expect, it } from "vitest";
import { nextKotNumber } from "../../lib/kots";
import { createTenantDbFactory } from "../../lib/tenant";
import { createAuthHarness } from "../../test/auth-harness";
import { restaurant } from "../../test/restaurant";

type Harness = Awaited<ReturnType<typeof createAuthHarness>>;
let h: Harness;

afterEach(async () => {
  await h.close();
});

let seq = 0;
const clientId = () => `kot-test-${Date.now()}-${++seq}`;

async function setup(tables = 2) {
  h = await createAuthHarness();
  await seedPlans(h.prisma);
  const r = await restaurant(h);
  const hall = floorSectionSchema.parse(
    (await r.owner("POST", "/api/owner/floor/sections", { name: "Main Hall" })).json(),
  );
  const bulk = (
    await r.owner("POST", "/api/owner/floor/tables/bulk", {
      sectionId: hall.id,
      prefix: "T",
      from: "1",
      to: tables,
    })
  ).json<{ tables: unknown[] }>();
  const tableIds = bulk.tables.map((t) => floorTableSchema.parse(t).id);
  const mains = menuCategorySchema.parse(
    (await r.owner("POST", "/api/owner/menu/categories", { name: "Mains" })).json(),
  );
  const item = async (name: string) =>
    menuItemSchema.parse(
      (
        await r.owner("POST", "/api/owner/menu/items", {
          categoryId: mains.id,
          name,
          dietType: "VEG",
          basePrice: 20_000,
          taxRateBps: 500,
        })
      ).json(),
    );
  const dal = await item("Dal Makhani");
  const naan = await item("Butter Naan");
  const send = async (tableId: string, items: object[], id = clientId()) =>
    r.owner("POST", "/api/staff/orders", { clientId: id, tableId, items });
  return { r, tableIds, dal, naan, send };
}

describe("KOTs (M5-T2)", () => {
  it("turns each send into a KOT with only its new items, numbered 1, 2…", async () => {
    const { r, tableIds, dal, naan, send } = await setup();
    const t1 = tableIds[0] ?? "";
    const events: OutletEvent[] = [];
    const off = h.app.events.subscribe((_ctx, e) => {
      events.push(e);
    });

    const first = createdOrderSchema.parse(
      (
        await send(t1, [
          { itemId: dal.id, quantity: 2 },
          { itemId: naan.id, quantity: 4 },
        ])
      ).json(),
    );
    expect(first.kot?.number).toBe(1);
    const second = createdOrderSchema.parse(
      (await send(t1, [{ itemId: naan.id, quantity: 2 }])).json(),
    );
    expect(second.kot?.number).toBe(2);

    const kots = await h.prisma.kot.findMany({
      orderBy: { number: "asc" },
      include: { items: { select: { nameSnapshot: true, quantity: true, status: true } } },
    });
    expect(
      kots.map((k) => [
        k.number,
        k.station,
        k.items.map((i) => [i.nameSnapshot, i.quantity, i.status]),
      ]),
    ).toEqual([
      [
        1,
        "KITCHEN",
        expect.arrayContaining([
          ["Dal Makhani", 2, "SENT"],
          ["Butter Naan", 4, "SENT"],
        ]),
      ],
      [2, "KITCHEN", [["Butter Naan", 2, "SENT"]]],
    ]);
    expect(kots[0]?.businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await h.prisma.orderItem.count({ where: { status: "NEW" } })).toBe(0);

    const kotEvents = events.filter((e) => e.name === "kot.created");
    expect(kotEvents.map((e) => e.payload)).toEqual([
      { outletId: r.outletId, kotId: first.kot?.id, number: 1, orderId: first.id, tableId: t1 },
      { outletId: r.outletId, kotId: second.kot?.id, number: 2, orderId: second.id, tableId: t1 },
    ]);
    off();
  });

  it("does not make a second KOT when a send is retried", async () => {
    const { tableIds, dal, send } = await setup();
    const id = clientId();
    const first = createdOrderSchema.parse(
      (await send(tableIds[0] ?? "", [{ itemId: dal.id, quantity: 1 }], id)).json(),
    );
    const again = createdOrderSchema.parse(
      (await send(tableIds[0] ?? "", [{ itemId: dal.id, quantity: 1 }], id)).json(),
    );
    expect(again).toMatchObject({ created: false, kot: { id: first.kot?.id, number: 1 } });
    expect(await h.prisma.kot.count()).toBe(1);
    expect((await h.prisma.kotCounter.findFirstOrThrow()).last).toBe(1);
  });

  it("numbers 10 sends at the same instant 1–10 with no gaps or repeats", async () => {
    const { tableIds, dal, send } = await setup(10);
    const results = await Promise.all(
      tableIds.map((t) => send(t, [{ itemId: dal.id, quantity: 1 }])),
    );
    expect(results.map((r) => r.statusCode)).toEqual(Array(10).fill(201));
    const numbers = results.map((r) => createdOrderSchema.parse(r.json()).kot?.number);
    expect([...numbers].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("restarts every business day, separately for each outlet", async () => {
    const { r } = await setup();
    const db = createTenantDbFactory(h.prisma);
    const ctxA = {
      organizationId: r.organizationId,
      outletId: r.outletId,
      actor: { kind: "system" as const, reason: "test" },
    };
    expect(await nextKotNumber(db(ctxA), ctxA, "2026-11-19")).toBe(1);
    expect(await nextKotNumber(db(ctxA), ctxA, "2026-11-19")).toBe(2);
    expect(await nextKotNumber(db(ctxA), ctxA, "2026-11-20")).toBe(1);

    h.clearCookies();
    const other = await restaurant(h, "+919876500002");
    const ctxB = { ...ctxA, organizationId: other.organizationId, outletId: other.outletId };
    expect(await nextKotNumber(db(ctxB), ctxB, "2026-11-19")).toBe(1);
    expect(await nextKotNumber(db(ctxA), ctxA, "2026-11-19")).toBe(3);
  });
});
