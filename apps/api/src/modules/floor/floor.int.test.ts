// M3-T1: sections and tables — bulk add, grid placement, layout saves, delete rules, isolation.
import { seedPlans } from "@restoos/db/testing";
import {
  apiErrorSchema,
  floorSchema,
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
const bulkResult = z.object({ tables: z.array(floorTableSchema) });

async function setup() {
  h = await createAuthHarness();
  await seedPlans(h.prisma);
  const r = await restaurant(h);
  const api = (method: "GET" | "POST" | "PATCH" | "PUT", url: string, body?: object) =>
    r.owner(method, `/api/owner/floor${url}`, body);
  const del = (url: string) =>
    h.app.inject({
      method: "DELETE",
      url: `/api/owner/floor${url}`,
      headers: {
        "x-outlet-id": r.outletId,
        cookie: [...h.jar].map(([k, v]) => `${k}=${v}`).join("; "),
      },
    });
  const section = async (name: string) =>
    floorSectionSchema.parse((await api("POST", "/sections", { name })).json());
  const floor = async () => floorSchema.parse((await api("GET", "")).json());
  return { r, api, del, section, floor };
}

describe("/api/owner/floor", () => {
  it("bulk-adds T1–T20 with unique QR tokens, placed on the grid without overlap", async () => {
    const { api, section, floor } = await setup();
    const hall = await section("Main Hall");
    const res = await api("POST", "/tables/bulk", {
      sectionId: hall.id,
      prefix: "t",
      from: "1",
      to: 20,
      seats: 4,
    });
    expect(res.statusCode, res.body).toBe(201);
    const { tables } = bulkResult.parse(res.json());
    expect(tables.map((t) => t.label)).toEqual(Array.from({ length: 20 }, (_, i) => `T${i + 1}`));
    // Row by row, 8 wide: T1 (0,0) … T8 (7,0), T9 (0,1).
    expect(tables.slice(7, 9).map((t) => [t.label, t.posX, t.posY])).toEqual([
      ["T8", 7, 0],
      ["T9", 0, 1],
    ]);
    const tokens = await h.prisma.diningTable.findMany({ select: { qrToken: true } });
    expect(new Set(tokens.map((t) => t.qrToken)).size).toBe(20);
    expect(tokens.every((t) => /^[A-Za-z0-9_-]{22}$/.test(t.qrToken))).toBe(true);
    expect((await floor()).sections[0]?.tables).toHaveLength(20);

    // A range overlapping existing labels creates nothing and lists the clashes.
    const clash = await api("POST", "/tables/bulk", {
      sectionId: hall.id,
      prefix: "T",
      from: "19",
      to: 22,
    });
    expect([clash.statusCode, code(clash)]).toEqual([409, "LABELS_TAKEN"]);
    expect(apiErrorSchema.parse(clash.json()).error.details).toEqual({ labels: ["T19", "T20"] });
    expect(await h.prisma.diningTable.count()).toBe(20);
  });

  it("manages sections: unique names, order, delete only when empty", async () => {
    const { api, del, section, floor } = await setup();
    const hall = await section("Main Hall");
    const terrace = await section("Terrace");
    const dup = await api("POST", "/sections", { name: "main hall" });
    expect([dup.statusCode, code(dup)]).toEqual([409, "SECTION_NAME_TAKEN"]);

    expect((await api("PUT", "/sections/order", { ids: [terrace.id, hall.id] })).statusCode).toBe(
      204,
    );
    expect((await api("PATCH", `/sections/${terrace.id}`, { name: "Rooftop" })).statusCode).toBe(
      204,
    );
    expect((await floor()).sections.map((s) => s.name)).toEqual(["Rooftop", "Main Hall"]);

    await api("POST", "/tables", { sectionId: hall.id, label: "T1" });
    const notEmpty = await del(`/sections/${hall.id}`);
    expect([notEmpty.statusCode, code(notEmpty)]).toEqual([409, "SECTION_NOT_EMPTY"]);
    expect((await del(`/sections/${terrace.id}`)).statusCode).toBe(204);
  });

  it("edits tables: label clash, moving cells and sections, layout save with swap", async () => {
    const { api, section, floor } = await setup();
    const hall = await section("Main Hall");
    const terrace = await section("Terrace");
    const { tables } = bulkResult.parse(
      (
        await api("POST", "/tables/bulk", { sectionId: hall.id, prefix: "T", from: "1", to: 3 })
      ).json(),
    );
    const [t1, t2, t3] = tables as [(typeof tables)[0], (typeof tables)[0], (typeof tables)[0]];

    const clash = await api("PATCH", `/tables/${t1.id}`, { label: "t2" });
    expect([clash.statusCode, code(clash)]).toEqual([409, "LABEL_TAKEN"]);
    const taken = await api("PATCH", `/tables/${t1.id}`, { posX: t2.posX, posY: t2.posY });
    expect([taken.statusCode, code(taken)]).toEqual([409, "CELL_TAKEN"]);
    expect(
      floorTableSchema.parse(
        (await api("PATCH", `/tables/${t1.id}`, { seats: 6, posX: 5, posY: 3 })).json(),
      ),
    ).toMatchObject({
      seats: 6,
      posX: 5,
      posY: 3,
    });
    // Moving to another section without a position → first free spot there.
    expect(
      floorTableSchema.parse(
        (await api("PATCH", `/tables/${t3.id}`, { sectionId: terrace.id })).json(),
      ),
    ).toMatchObject({
      posX: 0,
      posY: 0,
    });

    // Drag-and-drop save: swap T1 and T2 in one go.
    const swap = await api("PUT", "/layout", {
      tables: [
        { id: t1.id, sectionId: hall.id, posX: t2.posX, posY: t2.posY },
        { id: t2.id, sectionId: hall.id, posX: 5, posY: 3 },
      ],
    });
    expect(swap.statusCode, swap.body).toBe(204);
    const after = (await floor()).sections.find((s) => s.id === hall.id)?.tables ?? [];
    expect(after.map((t) => [t.label, t.posX, t.posY]).sort()).toEqual([
      ["T1", t2.posX, t2.posY],
      ["T2", 5, 3],
    ]);

    // A layout that puts two tables in one cell is refused as a whole.
    const bad = await api("PUT", "/layout", {
      tables: [{ id: t2.id, sectionId: hall.id, posX: t2.posX, posY: t2.posY }],
    });
    expect([bad.statusCode, code(bad)]).toEqual([409, "CELL_TAKEN"]);
  });

  it("deletes unused tables only, and publishes floor.changed", async () => {
    const { r, api, del, section } = await setup();
    const events: OutletEvent[] = [];
    const off = h.app.events.subscribe((_ctx, e) => {
      events.push(e);
    });
    const hall = await section("Main Hall");
    const t1 = floorTableSchema.parse(
      (await api("POST", "/tables", { sectionId: hall.id, label: "T1" })).json(),
    );
    const t2 = floorTableSchema.parse(
      (await api("POST", "/tables", { sectionId: hall.id, label: "T2" })).json(),
    );
    await h.prisma.tableSession.create({
      data: { organizationId: r.organizationId, outletId: r.outletId, tableId: t2.id },
    });

    expect((await del(`/tables/${t1.id}`)).statusCode).toBe(204);
    const used = await del(`/tables/${t2.id}`);
    expect([used.statusCode, code(used)]).toEqual([409, "TABLE_IN_USE"]);
    off();
    expect(events.filter((e) => e.name === "floor.changed").length).toBeGreaterThanOrEqual(4);
    expect(events[0]).toEqual({ name: "floor.changed", payload: { outletId: r.outletId } });
  });

  it("needs floor.edit, and keeps restaurants apart", async () => {
    const { r, api, section } = await setup();
    const hall = await section("Main Hall");
    const t1 = floorTableSchema.parse(
      (await api("POST", "/tables", { sectionId: hall.id, label: "T1" })).json(),
    );

    const meera = await r.addStaff("Meera", "MANAGER", "905172");
    const manager = await r.signedInTablet(meera.id, "905172");
    expect((await manager.call("GET", "/api/owner/floor")).statusCode).toBe(200);
    const priya = await r.addStaff("Priya", "CASHIER", "4827");
    const cashier = await r.signedInTablet(priya.id, "4827");
    expect(
      (await cashier.call("POST", "/api/owner/floor/sections", { name: "X" })).statusCode,
    ).toBe(403);

    h.clearCookies();
    const other = await restaurant(h, "+919876500002");
    const theirs = (method: "GET" | "POST" | "PATCH", url: string, body?: object) =>
      other.owner(method, `/api/owner/floor${url}`, body);
    expect(floorSchema.parse((await theirs("GET", "")).json()).sections).toEqual([]);
    expect(code(await theirs("PATCH", `/tables/${t1.id}`, { seats: 9 }))).toBe("NOT_FOUND");
    expect(code(await theirs("POST", "/tables", { sectionId: hall.id, label: "T9" }))).toBe(
      "NOT_FOUND",
    );
  });

  it("prints QR cards and rotates one table's code (old link dies at once, audited)", async () => {
    const { r, api, section } = await setup();
    const empty = await api("GET", "/qr-cards.pdf");
    expect([empty.statusCode, code(empty)]).toEqual([409, "NO_TABLES"]);

    const hall = await section("Main Hall");
    const terrace = await section("Terrace");
    const { tables } = bulkResult.parse(
      (
        await api("POST", "/tables/bulk", { sectionId: hall.id, prefix: "T", from: "1", to: 7 })
      ).json(),
    );
    await api("POST", "/tables", { sectionId: terrace.id, label: "R1" });
    const pages = (res: LightMyRequestResponse) =>
      (res.rawPayload.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;

    const all = await api("GET", "/qr-cards.pdf");
    expect(all.statusCode, all.body).toBe(200);
    expect(all.headers["content-type"]).toBe("application/pdf");
    expect(all.headers["content-disposition"]).toBe('attachment; filename="table-qr-codes.pdf"');
    expect(all.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pages(all)).toBe(2); // 8 cards, 6 per page
    expect(pages(await api("GET", `/qr-cards.pdf?sectionId=${terrace.id}`))).toBe(1);
    const t2 = tables[1];
    if (!t2) throw new Error("bulk add returned too few tables");
    const one = await api("GET", `/qr-cards.pdf?tableId=${t2.id}`);
    expect(one.headers["content-disposition"]).toBe('attachment; filename="table-T2-qr.pdf"');
    expect(code(await api("GET", "/qr-cards.pdf?sectionId=nope"))).toBe("NOT_FOUND");

    // Rotate T2: new token, the old customer link 404s, the new one works.
    const publicTable = (token: string) =>
      h.app.inject({ method: "GET", url: `/api/public/table/${token}` });
    expect((await publicTable(t2.qrToken)).statusCode).toBe(200);
    const rotated = await api("POST", `/tables/${t2.id}/rotate-qr`);
    expect(rotated.statusCode, rotated.body).toBe(200);
    const fresh = floorTableSchema.parse(rotated.json());
    expect(fresh.qrToken).not.toBe(t2.qrToken);
    expect(fresh.qrToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect((await publicTable(t2.qrToken)).statusCode).toBe(404);
    expect((await publicTable(fresh.qrToken)).statusCode).toBe(200);
    const audit = await h.prisma.auditLog.findMany({ where: { action: "table.rotateQr" } });
    expect(audit.map((a) => [a.entityId, a.outletId, a.actorType])).toEqual([
      [t2.id, r.outletId, "OWNER"],
    ]);

    // Cashiers can't print or rotate.
    const priya = await r.addStaff("Priya", "CASHIER", "4827");
    const cashier = await r.signedInTablet(priya.id, "4827");
    expect((await cashier.call("GET", "/api/owner/floor/qr-cards.pdf")).statusCode).toBe(403);
    expect(
      (await cashier.call("POST", `/api/owner/floor/tables/${t2.id}/rotate-qr`)).statusCode,
    ).toBe(403);
  });
});
