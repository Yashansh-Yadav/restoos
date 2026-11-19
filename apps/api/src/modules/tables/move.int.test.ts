// M5-T7: move guests to a free table and merge tables — what follows the guests (orders, KOTs,
// waiting guest orders), the status rules, the audit rows, events, and who may do it.
import { seedPlans } from "@restoos/db/testing";
import {
  apiErrorSchema,
  floorSectionSchema,
  floorTableSchema,
  kitchenBoardSchema,
  menuCategorySchema,
  menuItemSchema,
  movedTableSchema,
  orderPadSchema,
  staffFloorSchema,
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
const clientId = () => `move-${Date.now()}-${++seq}`;

async function setup() {
  h = await createAuthHarness();
  await seedPlans(h.prisma);
  const r = await restaurant(h);
  const owner = r.owner;
  const hall = floorSectionSchema.parse(
    (await owner("POST", "/api/owner/floor/sections", { name: "Main Hall" })).json(),
  );
  const table = async (label: string) =>
    floorTableSchema.parse(
      (await owner("POST", "/api/owner/floor/tables", { sectionId: hall.id, label })).json(),
    );
  const [t1, t2, t3, t5] = [
    await table("T1"),
    await table("T2"),
    await table("T3"),
    await table("T5"),
  ];
  const mains = menuCategorySchema.parse(
    (await owner("POST", "/api/owner/menu/categories", { name: "Mains" })).json(),
  );
  const dal = menuItemSchema.parse(
    (
      await owner("POST", "/api/owner/menu/items", {
        categoryId: mains.id,
        name: "Dal Makhani",
        dietType: "VEG",
        basePrice: 25_000,
        taxRateBps: 500,
      })
    ).json(),
  );
  const send = async (tableId: string, quantity = 1) => {
    const res = await owner("POST", "/api/staff/orders", {
      clientId: clientId(),
      tableId,
      items: [{ itemId: dal.id, quantity }],
    });
    expect(res.statusCode, res.body).toBe(201);
  };
  const move = (fromId: string, toTableId: string, kind: "transfer" | "merge") =>
    owner("POST", `/api/staff/tables/${fromId}/move`, { toTableId, kind });
  const status = async (id: string) =>
    (await h.prisma.diningTable.findUniqueOrThrow({ where: { id } })).status;
  const pad = async (id: string) =>
    orderPadSchema.parse((await owner("GET", `/api/staff/tables/${id}/order-pad`)).json());
  return { r, owner, t1, t2, t3, t5, dal, send, move, status, pad };
}

describe("move and merge tables (M5-T7)", () => {
  it("moves guests, their orders, KOT and a waiting guest order to a free table", async () => {
    const { owner, t1, t5, dal, send, move, status, pad } = await setup();
    await send(t1.id, 2);
    // A guest order waiting for approval on T1 as well.
    await owner("PATCH", "/api/owner/outlet/settings", { orderingMode: "SELF_ORDER_APPROVAL" });
    const guest = await h.app.inject({
      method: "POST",
      url: `/api/public/table/${t1.qrToken}/order`,
      payload: { clientId: clientId(), items: [{ itemId: dal.id, quantity: 1 }] },
    });
    expect(guest.statusCode, guest.body).toBe(201);
    const session = await h.prisma.tableSession.findFirstOrThrow({
      where: { tableId: t1.id, closedAt: null },
    });

    const events: OutletEvent[] = [];
    const off = h.app.events.subscribe((_ctx, e) => {
      events.push(e);
    });
    const res = await move(t1.id, t5.id, "transfer");
    expect(res.statusCode, res.body).toBe(200);
    expect(movedTableSchema.parse(res.json())).toEqual({
      kind: "transfer",
      from: { id: t1.id, label: "T1" },
      to: { id: t5.id, label: "T5", status: "ORDERED" },
    });
    off();

    expect([await status(t1.id), await status(t5.id)]).toEqual(["FREE", "ORDERED"]);
    // The same session now belongs to T5: orders, waiting guest order and KOT follow it.
    expect(
      (await h.prisma.tableSession.findUniqueOrThrow({ where: { id: session.id } })).tableId,
    ).toBe(t5.id);
    const p5 = await pad(t5.id);
    expect(p5.sent.map((l) => [l.name, l.quantity])).toEqual([["Dal Makhani", 2]]);
    expect(p5.pending).toHaveLength(1);
    const p1 = await pad(t1.id);
    expect(p1.sent).toEqual([]);
    const board = kitchenBoardSchema.parse((await owner("GET", "/api/staff/kitchen")).json());
    expect(board.kots.map((k) => [k.number, k.tableLabel])).toEqual([[1, "T5"]]);
    // The floor badge follows too.
    const floor = staffFloorSchema.parse((await owner("GET", "/api/staff/floor")).json());
    const tiles = floor.sections.flatMap((s) => s.tables);
    expect(tiles.find((t) => t.label === "T5")?.pendingApproval).toBe(true);
    expect(tiles.find((t) => t.label === "T1")?.pendingApproval).toBe(false);

    expect(events.map((e) => e.name)).toEqual([
      "table.statusChanged",
      "table.statusChanged",
      "table.moved",
    ]);
    const audit = await h.prisma.auditLog.findFirstOrThrow({ where: { action: "table.transfer" } });
    expect(audit).toMatchObject({ entity: "DiningTable", entityId: t1.id, actorType: "OWNER" });
    expect(audit.data).toMatchObject({
      from: { label: "T1", status: "ORDERED" },
      to: { label: "T5", statusBefore: "FREE", statusAfter: "ORDERED" },
      sessionId: session.id,
      orders: 2,
    });
  });

  it("merges one table's orders into another and frees it", async () => {
    const { owner, t1, t2, t3, send, move, status, pad } = await setup();
    await send(t1.id, 1);
    await send(t2.id, 3);
    // T3 only seated.
    await owner("POST", `/api/staff/tables/${t3.id}/status`, { event: "seat" });
    const t2Session = await h.prisma.tableSession.findFirstOrThrow({
      where: { tableId: t2.id, closedAt: null },
    });

    const res = await move(t2.id, t1.id, "merge");
    expect(res.statusCode, res.body).toBe(200);
    expect(movedTableSchema.parse(res.json()).to).toMatchObject({ label: "T1", status: "ORDERED" });
    expect([await status(t1.id), await status(t2.id)]).toEqual(["ORDERED", "FREE"]);
    expect(
      (await h.prisma.tableSession.findUniqueOrThrow({ where: { id: t2Session.id } })).closedAt,
    ).not.toBeNull();
    expect((await pad(t1.id)).sent.map((l) => l.quantity).sort()).toEqual([1, 3]);
    const board = kitchenBoardSchema.parse((await owner("GET", "/api/staff/kitchen")).json());
    expect(board.kots.map((k) => k.tableLabel)).toEqual(["T1", "T1"]);
    const audit = await h.prisma.auditLog.findFirstOrThrow({ where: { action: "table.merge" } });
    expect(audit.data).toMatchObject({ mergedSessionId: t2Session.id, orders: 1 });

    // Seated-only T3 joins T1 (waiting for its bill): back to Ordered stays Ordered.
    await h.prisma.diningTable.update({ where: { id: t1.id }, data: { status: "BILL_REQUESTED" } });
    expect((await move(t3.id, t1.id, "merge")).statusCode).toBe(200);
    expect([await status(t1.id), await status(t3.id)]).toEqual(["ORDERED", "FREE"]);
  });

  it("refuses bad moves and checks who may move", async () => {
    const { r, t1, t2, t3, t5, send, move } = await setup();
    await send(t1.id);
    await send(t2.id);

    expect(code(await move(t1.id, t2.id, "transfer"))).toBe("TABLE_NOT_FREE");
    expect(code(await move(t1.id, t5.id, "merge"))).toBe("NOTHING_TO_JOIN");
    expect(code(await move(t3.id, t5.id, "transfer"))).toBe("NOTHING_TO_MOVE");
    expect(code(await move(t1.id, t1.id, "transfer"))).toBe("SAME_TABLE");

    const rahul = await r.addStaff("Rahul", "BUTLER", "4827");
    const butler = await r.signedInTablet(rahul.id, "4827");
    const body = { toTableId: t5.id, kind: "transfer" };
    expect((await butler.call("POST", `/api/staff/tables/${t1.id}/move`, body)).statusCode).toBe(
      403,
    );
    const asha = await r.addStaff("Asha", "CASHIER", "3916");
    const cashier = await r.signedInTablet(asha.id, "3916");
    const ok = await cashier.call("POST", `/api/staff/tables/${t1.id}/move`, body);
    expect(ok.statusCode, ok.body).toBe(200);
    const audit = await h.prisma.auditLog.findFirstOrThrow({ where: { action: "table.transfer" } });
    expect(audit).toMatchObject({ actorType: "EMPLOYEE", actorId: asha.id });

    h.clearCookies();
    const other = await restaurant(h, "+919876500002");
    expect(
      code(
        await other.owner("POST", `/api/staff/tables/${t5.id}/move`, {
          toTableId: t1.id,
          kind: "transfer",
        }),
      ),
    ).toBe("NOT_FOUND");
  });
});
