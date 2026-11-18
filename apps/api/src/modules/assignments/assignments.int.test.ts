// M3-T3: butlers on shift get tables (tap butler → tap tables), moves, sections, and yesterday's
// tables coming back when a shift starts.
import { seedPlans } from "@restoos/db/testing";
import {
  apiErrorSchema,
  assignmentBoardSchema,
  floorSectionSchema,
  floorTableSchema,
  type OutletEvent,
} from "@restoos/shared";
import type { LightMyRequestResponse } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
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
  const floorApi = (url: string, body: object) => r.owner("POST", `/api/owner/floor${url}`, body);
  const hall = floorSectionSchema.parse(
    (await floorApi("/sections", { name: "Main Hall" })).json(),
  );
  const terrace = floorSectionSchema.parse(
    (await floorApi("/sections", { name: "Terrace" })).json(),
  );
  const { tables } = z
    .object({ tables: z.array(floorTableSchema) })
    .parse(
      (
        await floorApi("/tables/bulk", { sectionId: hall.id, prefix: "T", from: "1", to: 4 })
      ).json(),
    );
  const roof = floorTableSchema.parse(
    (await floorApi("/tables", { sectionId: terrace.id, label: "R1" })).json(),
  );
  const [t1, t2, t3, t4] = tables.map((t) => t.id) as [string, string, string, string];

  const board = async () =>
    assignmentBoardSchema.parse((await r.owner("GET", "/api/staff/assignments")).json());
  const assign = (tableId: string, employeeId: string | null) =>
    r.owner("PUT", `/api/staff/assignments/tables/${tableId}`, { employeeId });
  const holders = async () =>
    Object.fromEntries(
      (await board()).sections.flatMap((s) => s.tables.map((t) => [t.label, t.butlerId])),
    );
  return { r, hall, terrace, t1, t2, t3, t4, roof: roof.id, board, assign, holders };
}

describe("/api/staff/assignments", () => {
  it("assigns, moves and unassigns tables between on-shift butlers", async () => {
    const { r, t1, t2, t3, board, assign, holders } = await setup();
    const events: OutletEvent[] = [];
    const off = h.app.events.subscribe((_ctx, e) => {
      events.push(e);
    });
    const rahul = await r.addStaff("Rahul", "BUTLER", "4827");
    const amit = await r.addStaff("Amit", "BUTLER", "5938");
    await r.signedInTablet(rahul.id, "4827");
    await r.signedInTablet(amit.id, "5938");

    expect((await assign(t1, rahul.id)).statusCode).toBe(204);
    expect((await assign(t2, rahul.id)).statusCode).toBe(204);
    expect((await assign(t2, rahul.id)).statusCode).toBe(204); // idempotent
    expect((await assign(t3, amit.id)).statusCode).toBe(204);
    expect(await holders()).toMatchObject({ T1: rahul.id, T2: rahul.id, T3: amit.id, T4: null });

    // Moving T2 to Amit ends Rahul's hold (kept as history).
    await assign(t2, amit.id);
    expect(await holders()).toMatchObject({ T1: rahul.id, T2: amit.id });
    expect(
      await h.prisma.tableAssignment.count({ where: { tableId: t2, endedAt: { not: null } } }),
    ).toBe(1);

    await assign(t1, null);
    const b = await board();
    expect(b.butlers.map((x) => [x.name, x.onShift, x.tableIds.length])).toEqual([
      ["Amit", true, 2],
      ["Rahul", true, 0],
    ]);
    expect(events.filter((e) => e.name === "assignment.changed")).toHaveLength(6);
    off();
  });

  it("gives a whole section, refuses non-butlers and off-shift staff", async () => {
    const { r, hall, t1, roof, assign, holders } = await setup();
    const rahul = await r.addStaff("Rahul", "BUTLER", "4827");
    const amit = await r.addStaff("Amit", "BUTLER", "5938");
    const priya = await r.addStaff("Priya", "CASHIER", "6149");
    await r.signedInTablet(rahul.id, "4827");
    await r.signedInTablet(amit.id, "5938");
    await r.signedInTablet(priya.id, "6149");

    await assign(t1, amit.id);
    const all = await r.owner("PUT", `/api/staff/assignments/sections/${hall.id}`, {
      employeeId: rahul.id,
    });
    expect(all.statusCode, all.body).toBe(204);
    expect(await holders()).toEqual({
      T1: rahul.id,
      T2: rahul.id,
      T3: rahul.id,
      T4: rahul.id,
      R1: null,
    });

    const cashier = await assign(roof, priya.id);
    expect([cashier.statusCode, code(cashier)]).toEqual([400, "NOT_A_BUTLER"]);
    const sunil = await r.addStaff("Sunil", "BUTLER", "7362"); // never signed in
    const notOnShift = await assign(roof, sunil.id);
    expect([notOnShift.statusCode, code(notOnShift)]).toEqual([409, "NOT_ON_SHIFT"]);
    expect(code(await assign("nope", rahul.id))).toBe("NOT_FOUND");
    expect(code(await assign(roof, "nope"))).toBe("NOT_FOUND");
  });

  it("ends with the shift, and yesterday's tables come back on the next shift", async () => {
    const { r, t1, t2, t3, board, assign, holders } = await setup();
    const rahul = await r.addStaff("Rahul", "BUTLER", "4827");
    const amit = await r.addStaff("Amit", "BUTLER", "5938");
    const rahulTablet = await r.signedInTablet(rahul.id, "4827");
    await r.signedInTablet(amit.id, "5938");
    await assign(t1, rahul.id);
    await assign(t2, rahul.id);
    await assign(t3, rahul.id);
    await assign(t3, null); // taken off before the shift ended: not "usual"

    expect((await rahulTablet.call("POST", "/api/staff/shift/end")).statusCode).toBe(204);
    const offShift = (await board()).butlers.find((b) => b.id === rahul.id);
    expect(offShift).toMatchObject({ onShift: false, tableIds: [] });
    expect(offShift?.usualTableIds.sort()).toEqual([t1, t2].sort());
    expect(await holders()).toMatchObject({ T1: null, T2: null });

    // Meanwhile Amit takes T2; when Rahul signs back in he gets T1 only.
    await assign(t2, amit.id);
    const again = await rahulTablet.call("POST", "/api/device/login", {
      employeeId: rahul.id,
      pin: "4827",
    });
    expect(again.statusCode, again.body).toBe(204);
    expect(await holders()).toMatchObject({ T1: rahul.id, T2: amit.id, T3: null });
  });

  it("needs table.assign; other restaurants' ids are not found", async () => {
    const { r, t1 } = await setup();
    const meera = await r.addStaff("Meera", "MANAGER", "905172");
    const rahul = await r.addStaff("Rahul", "BUTLER", "4827");
    const manager = await r.signedInTablet(meera.id, "905172");
    const butler = await r.signedInTablet(rahul.id, "4827");
    expect((await manager.call("GET", "/api/staff/assignments")).statusCode).toBe(200);
    expect(
      (
        await manager.call("PUT", `/api/staff/assignments/tables/${t1}`, {
          employeeId: rahul.id,
        })
      ).statusCode,
    ).toBe(204);
    expect((await butler.call("GET", "/api/staff/assignments")).statusCode).toBe(403);
    expect(
      (await butler.call("PUT", `/api/staff/assignments/tables/${t1}`, { employeeId: null }))
        .statusCode,
    ).toBe(403);

    h.clearCookies();
    const other = await restaurant(h, "+919876500002");
    const theirs = await other.owner("PUT", `/api/staff/assignments/tables/${t1}`, {
      employeeId: null,
    });
    expect(code(theirs)).toBe("NOT_FOUND");
    const board = assignmentBoardSchema.parse(
      (await other.owner("GET", "/api/staff/assignments")).json(),
    );
    expect(board).toEqual({ butlers: [], sections: [] });
  });
});
