// M5-T3: the kitchen board (stage from items, oldest first), one-step moves with undo,
// kot.itemStatusChanged, the late-time setting, and who may use it.
import { seedPlans } from "@restoos/db/testing";
import {
  apiErrorSchema,
  createdOrderSchema,
  floorSectionSchema,
  floorTableSchema,
  kitchenBoardSchema,
  menuCategorySchema,
  menuItemSchema,
  outletSettingsSchema,
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
const clientId = () => `kitchen-test-${Date.now()}-${++seq}`;

async function setup() {
  h = await createAuthHarness();
  await seedPlans(h.prisma);
  const r = await restaurant(h);
  const hall = floorSectionSchema.parse(
    (await r.owner("POST", "/api/owner/floor/sections", { name: "Main Hall" })).json(),
  );
  const t1 = floorTableSchema.parse(
    (await r.owner("POST", "/api/owner/floor/tables", { sectionId: hall.id, label: "T1" })).json(),
  );
  const mains = menuCategorySchema.parse(
    (await r.owner("POST", "/api/owner/menu/categories", { name: "Mains" })).json(),
  );
  const dal = menuItemSchema.parse(
    (
      await r.owner("POST", "/api/owner/menu/items", {
        categoryId: mains.id,
        name: "Dal Makhani",
        dietType: "VEG",
        basePrice: 25_000,
        taxRateBps: 500,
      })
    ).json(),
  );
  const send = async (quantity: number, note?: string) =>
    createdOrderSchema.parse(
      (
        await r.owner("POST", "/api/staff/orders", {
          clientId: clientId(),
          tableId: t1.id,
          items: [{ itemId: dal.id, quantity, ...(note ? { note } : {}) }],
        })
      ).json(),
    );
  const board = async () =>
    kitchenBoardSchema.parse((await r.owner("GET", "/api/staff/kitchen")).json());
  const move = (kotId: string, to: string) =>
    r.owner("POST", `/api/staff/kots/${kotId}/stage`, { to });
  return { r, t1, send, board, move };
}

describe("kitchen display (M5-T3)", () => {
  it("lists tickets oldest first with their items, and moves them one step at a time", async () => {
    const { r, send, board, move } = await setup();
    const events: OutletEvent[] = [];
    const off = h.app.events.subscribe((_ctx, e) => {
      events.push(e);
    });
    const first = await send(2, "less oil");
    const second = await send(1);

    const b = await board();
    expect(b.lateAfterMinutes).toBe(15);
    expect(b.kots.map((k) => [k.number, k.stage, k.tableLabel])).toEqual([
      [1, "NEW", "T1"],
      [2, "NEW", "T1"],
    ]);
    expect(b.kots[0]?.items).toEqual([
      expect.objectContaining({
        name: "Dal Makhani",
        quantity: 2,
        note: "less oil",
        status: "SENT",
      }),
    ]);

    const kot1 = first.kot?.id ?? "";
    expect((await move(kot1, "PREPARING")).json()).toMatchObject({ number: 1, stage: "PREPARING" });
    expect((await move(kot1, "READY")).json()).toMatchObject({ stage: "READY" });
    expect(
      await h.prisma.orderItem.findMany({ where: { kotId: kot1 }, select: { status: true } }),
    ).toEqual([{ status: "READY" }]);
    // Undo a mis-tap: one step back.
    expect((await move(kot1, "PREPARING")).json()).toMatchObject({ stage: "PREPARING" });

    const stages = await board();
    expect(stages.kots.map((k) => [k.number, k.stage])).toEqual([
      [1, "PREPARING"],
      [2, "NEW"],
    ]);
    expect(events.filter((e) => e.name === "kot.itemStatusChanged").map((e) => e.payload)).toEqual([
      expect.objectContaining({ outletId: r.outletId, kotId: kot1, stage: "PREPARING" }),
      expect.objectContaining({ kotId: kot1, stage: "READY" }),
      expect.objectContaining({ kotId: kot1, stage: "PREPARING" }),
    ]);

    // Skipping a step, or repeating one (a double tap), is refused.
    const skip = await move(second.kot?.id ?? "", "READY");
    expect([skip.statusCode, code(skip)]).toEqual([409, "INVALID_KOT_STEP"]);
    const again = await move(kot1, "PREPARING");
    expect(code(again)).toBe("INVALID_KOT_STEP");

    // Served items leave the board (M5-T4 will do this from the butler's screen).
    await h.prisma.orderItem.updateMany({ where: { kotId: kot1 }, data: { status: "SERVED" } });
    expect((await board()).kots.map((k) => k.number)).toEqual([2]);
    const done = await move(kot1, "READY");
    expect(code(done)).toBe("KOT_DONE");
    off();
  });

  it("uses the outlet's late time, lets the kitchen in and keeps others out", async () => {
    const { r, send, board } = await setup();
    const saved = await r.owner("PATCH", "/api/owner/outlet/settings", { kotLateMinutes: 25 });
    expect(outletSettingsSchema.parse(saved.json())).toMatchObject({ kotLateMinutes: 25 });
    expect((await board()).lateAfterMinutes).toBe(25);
    const tooShort = await r.owner("PATCH", "/api/owner/outlet/settings", { kotLateMinutes: 2 });
    expect(tooShort.statusCode).toBe(400);

    const sent = await send(1);
    const imran = await r.addStaff("Imran", "KITCHEN", "5938");
    const kitchen = await r.signedInTablet(imran.id, "5938");
    const res = await kitchen.call("GET", "/api/staff/kitchen");
    expect(res.statusCode).toBe(200);
    expect(kitchenBoardSchema.parse(res.json()).kots).toHaveLength(1);
    expect(
      (
        await kitchen.call("POST", `/api/staff/kots/${sent.kot?.id ?? ""}/stage`, {
          to: "PREPARING",
        })
      ).statusCode,
    ).toBe(200);

    const rahul = await r.addStaff("Rahul", "BUTLER", "4827");
    const butler = await r.signedInTablet(rahul.id, "4827");
    expect((await butler.call("GET", "/api/staff/kitchen")).statusCode).toBe(403);

    h.clearCookies();
    const other = await restaurant(h, "+919876500002");
    expect(
      kitchenBoardSchema.parse((await other.owner("GET", "/api/staff/kitchen")).json()).kots,
    ).toEqual([]);
    expect(
      code(
        await other.owner("POST", `/api/staff/kots/${sent.kot?.id ?? ""}/stage`, { to: "READY" }),
      ),
    ).toBe("NOT_FOUND");
  });
});
