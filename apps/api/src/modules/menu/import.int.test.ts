// M2-T3: upload → preview → commit, through the real API and database.
import { seedPlans } from "@restoos/db/testing";
import {
  apiErrorSchema,
  importPreviewSchema,
  importResultSchema,
  menuItemSchema,
  ownerMenuSchema,
  type MenuSheetRow,
} from "@restoos/shared";
import type { LightMyRequestResponse } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { ORIGIN, createAuthHarness } from "../../test/auth-harness";
import { restaurant } from "../../test/restaurant";
import { readMenuSheet } from "./import";
import { buildMenuWorkbook, menuToRows } from "./template";

type Harness = Awaited<ReturnType<typeof createAuthHarness>>;
let h: Harness;

afterEach(async () => {
  await h.close();
});

const code = (res: LightMyRequestResponse) => apiErrorSchema.parse(res.json()).error.code;

const row = (over: Partial<MenuSheetRow>): MenuSheetRow => ({
  category: "Mains",
  categoryHi: "",
  name: "Dal Makhani",
  nameHi: "",
  code: "",
  diet: "Veg",
  price: "240",
  sizes: "",
  gst: "5",
  hsnSac: "",
  description: "",
  show: "",
  ...over,
});

async function setup() {
  h = await createAuthHarness();
  await seedPlans(h.prisma);
  const r = await restaurant(h);
  const cookie = () => [...h.jar].map(([k, v]) => `${k}=${v}`).join("; ");

  const upload = (bytes: Buffer, filename = "menu.xlsx") => {
    const boundary = "----restoos" + Math.random().toString(16).slice(2);
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return h.app.inject({
      method: "POST",
      url: "/api/owner/menu/import",
      payload,
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        origin: ORIGIN,
        "x-outlet-id": r.outletId,
        cookie: cookie(),
      },
    });
  };
  const sheet = (rows: MenuSheetRow[]) => buildMenuWorkbook({ outletName: "Bandra", rows });
  const commit = (id: string, mode: "all" | "validOnly") =>
    r.owner("POST", `/api/owner/menu/import/${id}/commit`, { mode });
  const getMenu = async () =>
    ownerMenuSchema.parse((await r.owner("GET", "/api/owner/menu")).json());
  return { r, upload, sheet, commit, getMenu };
}

describe("menu import", () => {
  it("shows exactly the 3 bad rows and saves nothing until told to import the valid ones", async () => {
    const { upload, sheet, commit, getMenu } = await setup();
    const res = await upload(
      await sheet([
        row({ name: "Dal Makhani" }),
        row({ name: "Bad GST", gst: "12" }),
        row({ name: "Paneer Tikka", category: "Starters", price: "", sizes: "Half=140, Full=220" }),
        row({ name: "No Price", price: "" }),
        row({ name: "Bad Type", diet: "Vegan" }),
      ]),
    );
    expect(res.statusCode, res.body).toBe(201);
    const preview = importPreviewSchema.parse(res.json());
    expect(preview.counts).toEqual({ rows: 5, new: 2, update: 0, unchanged: 0, error: 3 });
    expect(preview.rows.filter((r) => r.status === "error").map((r) => r.row)).toEqual([3, 5, 6]);
    expect(preview.newCategories).toEqual(["Mains", "Starters"]);

    // "Import all" is refused while problems exist — and nothing was written.
    const all = await commit(preview.importId, "all");
    expect([all.statusCode, code(all)]).toEqual([400, "IMPORT_HAS_ERRORS"]);
    expect((await getMenu()).items).toEqual([]);
    expect(await h.prisma.menuCategory.count()).toBe(0);

    const done = importResultSchema.parse((await commit(preview.importId, "validOnly")).json());
    expect(done).toEqual({ added: 2, updated: 0, unchanged: 0, skipped: 3, categoriesAdded: 2 });
    const menu = await getMenu();
    expect(menu.items.map((i) => i.name).sort()).toEqual(["Dal Makhani", "Paneer Tikka"]);
    expect(menu.items.find((i) => i.name === "Paneer Tikka")?.variants.map((v) => v.price)).toEqual(
      [14_000, 22_000],
    );

    // One import, once.
    const again = await commit(preview.importId, "validOnly");
    expect([again.statusCode, code(again)]).toEqual([409, "ALREADY_IMPORTED"]);
    const record = await h.prisma.menuImport.findFirstOrThrow();
    expect(record).toMatchObject({ status: "COMMITTED", rowCount: 5, errorCount: 3 });
  });

  it("round-trips the exported menu: price change updates by code, photo and add-ons kept", async () => {
    const { r, upload, commit, getMenu } = await setup();
    const api = (method: "POST" | "PATCH", url: string, body: object) =>
      r.owner(method, `/api/owner/menu${url}`, body);
    const cat = (await api("POST", "/categories", { name: "Mains" })).json<{ id: string }>();
    const group = (
      await api("POST", "/addon-groups", {
        name: "Extras",
        minSelect: 0,
        maxSelect: 1,
        addOns: [{ name: "Butter", price: 2_000 }],
      })
    ).json<{ id: string }>();
    const dal = menuItemSchema.parse(
      (
        await api("POST", "/items", {
          categoryId: cat.id,
          name: "Dal Makhani",
          code: "MN1",
          dietType: "VEG",
          basePrice: 24_000,
          taxRateBps: 500,
          addOnGroupIds: [group.id],
        })
      ).json(),
    );
    await h.prisma.menuItem.update({
      where: { id: dal.id },
      data: { imageUrl: "/api/files/menu/x.webp" },
    });

    // Owner exports, edits the price in Excel, re-imports.
    const rows = await readMenuSheet(
      (await r.owner("GET", "/api/owner/menu/export.xlsx")).rawPayload,
    );
    if (!rows.ok) throw new Error(rows.error);
    const exported = menuToRows(await getMenu());
    expect(exported).toHaveLength(1);
    const edited = await buildMenuWorkbook({
      outletName: "Bandra",
      rows: exported.map((x) => ({ ...x, price: "260", name: "Dal Makhani (Special)" })),
    });

    const preview = importPreviewSchema.parse((await upload(edited)).json());
    expect(preview.rows.map((x) => [x.status, x.changes])).toEqual([["update", ["Name", "Price"]]]);
    expect(importResultSchema.parse((await commit(preview.importId, "all")).json())).toMatchObject({
      added: 0,
      updated: 1,
    });
    const after = (await getMenu()).items;
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({
      id: dal.id,
      name: "Dal Makhani (Special)",
      basePrice: 26_000,
      imageUrl: "/api/files/menu/x.webp",
      addOnGroupIds: [group.id],
    });

    // The same file again → nothing to change.
    const again = importPreviewSchema.parse((await upload(edited)).json());
    expect(again.counts).toMatchObject({ unchanged: 1, new: 0, update: 0 });
  });

  it("rejects files that aren't the menu sheet, and keeps uploads private", async () => {
    const { upload, sheet } = await setup();
    const csv = await upload(Buffer.from("name,price\nDal,240"), "menu.csv");
    expect([csv.statusCode, code(csv)]).toEqual([400, "IMPORT_FILE"]);

    const ok = importPreviewSchema.parse((await upload(await sheet([row({})]))).json());
    const record = await h.prisma.menuImport.findUniqueOrThrow({ where: { id: ok.importId } });
    expect(record.fileUrl).toMatch(/^imports\//);
    expect(
      (await h.app.inject({ method: "GET", url: `/api/files/${record.fileUrl}` })).statusCode,
    ).toBe(404);
  });

  it("isolates imports per restaurant and needs menu.edit", async () => {
    const { r, upload, sheet } = await setup();
    const mine = importPreviewSchema.parse((await upload(await sheet([row({})]))).json());

    const priya = await r.addStaff("Priya", "CASHIER", "4827");
    const cashier = await r.signedInTablet(priya.id, "4827");
    expect((await cashier.call("GET", `/api/owner/menu/import/${mine.importId}`)).statusCode).toBe(
      403,
    );

    h.clearCookies();
    const other = await restaurant(h, "+919876500002");
    const theirs = await other.owner("POST", `/api/owner/menu/import/${mine.importId}/commit`, {
      mode: "all",
    });
    expect([theirs.statusCode, code(theirs)]).toEqual([404, "NOT_FOUND"]);
  });
});
