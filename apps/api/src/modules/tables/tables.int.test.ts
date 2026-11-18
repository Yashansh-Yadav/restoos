// M3-T4: the table state machine enforced in transitionTable(), and the staff floor view.
import { seedPlans } from "@restoos/db/testing";
import {
  apiErrorSchema,
  floorSectionSchema,
  floorTableSchema,
  staffFloorSchema,
  type OutletEvent,
  type TableEvent,
} from "@restoos/shared";
import type { LightMyRequestResponse } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { transitionTable } from "../../lib/tables";
import { createTenantDbFactory } from "../../lib/tenant";
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
  const { tables } = z
    .object({ tables: z.array(floorTableSchema) })
    .parse(
      (
        await floorApi("/tables/bulk", { sectionId: hall.id, prefix: "T", from: "1", to: 3 })
      ).json(),
    );
  const [t1, t2, t3] = tables.map((t) => t.id) as [string, string, string];

  // Orders and bills (M5/M7) will call transitionTable directly; tests do the same.
  const getTenantDb = createTenantDbFactory(h.prisma);
  const ctx = {
    organizationId: r.organizationId,
    outletId: r.outletId,
    actor: { kind: "system" as const, reason: "test" },
  };
  const service = (tableId: string, event: TableEvent) =>
    transitionTable({ db: getTenantDb(ctx), ctx, events: h.app.events }, tableId, event);
  const tap = (tableId: string, event: string) =>
    r.owner("POST", `/api/staff/tables/${tableId}/status`, { event });
  const status = async (tableId: string) =>
    (await h.prisma.diningTable.findUniqueOrThrow({ where: { id: tableId } })).status;
  return { r, t1, t2, t3, service, tap, status };
}

describe("table state machine + /api/staff/floor", () => {
  it("walks a table through a full visit, opening and closing the session", async () => {
    const { t1, service, tap, status } = await setup();
    const events: OutletEvent[] = [];
    const off = h.app.events.subscribe((_ctx, e) => {
      events.push(e);
    });

    const seated = await tap(t1, "seat");
    expect(seated.statusCode, seated.body).toBe(200);
    expect(seated.json()).toMatchObject({ status: "OCCUPIED", label: "T1" });
    const open = await h.prisma.tableSession.findMany({ where: { tableId: t1, closedAt: null } });
    expect(open).toHaveLength(1);

    await service(t1, "order");
    await service(t1, "requestBill");
    await service(t1, "order"); // more items after asking for the bill
    await service(t1, "requestBill");
    expect(await status(t1)).toBe("BILL_REQUESTED");
    expect((await service(t1, "pay")).status).toBe("PAID");
    expect(await h.prisma.tableSession.count({ where: { tableId: t1, closedAt: null } })).toBe(0);

    expect((await tap(t1, "clear")).json()).toMatchObject({ status: "CLEANING" });
    expect((await tap(t1, "cleaned")).json()).toMatchObject({ status: "FREE" });
    expect(await h.prisma.tableSession.count({ where: { tableId: t1 } })).toBe(1);
    expect(
      events
        .filter((e) => e.name === "table.statusChanged")
        .map((e) => (e.name === "table.statusChanged" ? e.payload.status : null)),
    ).toEqual([
      "OCCUPIED",
      "ORDERED",
      "BILL_REQUESTED",
      "ORDERED",
      "BILL_REQUESTED",
      "PAID",
      "CLEANING",
      "FREE",
    ]);
    off();
  });

  it("refuses invalid transitions; guests leaving frees a seated table", async () => {
    const { t1, t2, service, tap, status } = await setup();
    const clean = await tap(t1, "cleaned");
    expect([clean.statusCode, code(clean)]).toEqual([409, "INVALID_TABLE_TRANSITION"]);
    expect(apiErrorSchema.parse(clean.json()).error.message).toBe(
      "T1 is free — it can't be marked clean.",
    );
    // Only the manual events are accepted over HTTP.
    expect((await tap(t1, "pay")).statusCode).toBe(400);
    await expect(service(t1, "pay")).rejects.toMatchObject({ code: "INVALID_TABLE_TRANSITION" });

    await tap(t1, "seat");
    expect((await tap(t1, "unseat")).json()).toMatchObject({ status: "FREE" });
    expect(await h.prisma.tableSession.count({ where: { tableId: t1, closedAt: null } })).toBe(0);

    // Once guests ordered, "guests left" is no longer allowed.
    await service(t2, "order");
    const leave = await tap(t2, "unseat");
    expect([leave.statusCode, code(leave)]).toEqual([409, "INVALID_TABLE_TRANSITION"]);
    expect(await status(t2)).toBe("ORDERED");

    // Two taps at once: exactly one wins.
    const both = await Promise.all([tap(t1, "seat"), tap(t1, "seat")]);
    expect(both.map((b) => b.statusCode).sort()).toEqual([200, 409]);
    expect(await h.prisma.tableSession.count({ where: { tableId: t1, closedAt: null } })).toBe(1);
  });

  it("shows status, my tables, ringing bells and orders waiting for approval", async () => {
    const { r, t1, t2, t3, service, tap } = await setup();
    const rahul = await r.addStaff("Rahul", "BUTLER", "4827");
    const tablet = await r.signedInTablet(rahul.id, "4827");
    await r.owner("PUT", `/api/staff/assignments/tables/${t1}`, { employeeId: rahul.id });
    await tap(t1, "seat");
    const { sessionId } = await service(t2, "order");
    if (!sessionId) throw new Error("order should open a session");
    await h.prisma.order.create({
      data: {
        organizationId: r.organizationId,
        outletId: r.outletId,
        tableSessionId: sessionId,
        source: "CUSTOMER",
        status: "PENDING_APPROVAL",
        clientId: "client-1",
      },
    });
    await h.prisma.bellEvent.create({
      data: {
        organizationId: r.organizationId,
        outletId: r.outletId,
        tableId: t3,
        targetRole: "BUTLER",
      },
    });

    const res = await tablet.call("GET", "/api/staff/floor");
    expect(res.statusCode, res.body).toBe(200);
    const byLabel = Object.fromEntries(
      staffFloorSchema.parse(res.json()).sections[0]?.tables.map((t) => [t.label, t]) ?? [],
    );
    expect(byLabel.T1).toMatchObject({
      status: "OCCUPIED",
      mine: true,
      butlerName: "Rahul",
      activeBell: false,
    });
    expect(byLabel.T1?.since).toEqual(expect.any(String));
    expect(byLabel.T2).toMatchObject({ status: "ORDERED", mine: false, pendingApproval: true });
    expect(byLabel.T3).toMatchObject({ status: "FREE", activeBell: true, since: null });
  });

  it("keeps the kitchen out and other restaurants' tables not found", async () => {
    const { r, t1 } = await setup();
    const imran = await r.addStaff("Imran", "KITCHEN", "5938");
    const kitchen = await r.signedInTablet(imran.id, "5938");
    expect((await kitchen.call("GET", "/api/staff/floor")).statusCode).toBe(403);
    expect(
      (await kitchen.call("POST", `/api/staff/tables/${t1}/status`, { event: "seat" })).statusCode,
    ).toBe(403);

    h.clearCookies();
    const other = await restaurant(h, "+919876500002");
    const theirs = await other.owner("POST", `/api/staff/tables/${t1}/status`, { event: "seat" });
    expect(code(theirs)).toBe("NOT_FOUND");
  });
});
