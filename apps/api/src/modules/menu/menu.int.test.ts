// M2-T1: owners/managers edit the outlet menu — categories, items with sizes and add-ons,
// photos — isolated per restaurant, permission-checked, publishing menu.changed.
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { seedPlans } from "@restoos/db/testing";
import {
  addOnGroupSchema,
  apiErrorSchema,
  menuCategorySchema,
  menuItemSchema,
  ownerMenuSchema,
} from "@restoos/shared";
import type { LightMyRequestResponse } from "fastify";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { ORIGIN, createAuthHarness } from "../../test/auth-harness";
import { restaurant } from "../../test/restaurant";
import { readWorkbook } from "./template";

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
  const api = (method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, body?: object) =>
    r.owner(method as "GET", `/api/owner/menu${url}`, body);
  const category = async (name: string) =>
    menuCategorySchema.parse((await api("POST", "/categories", { name })).json());
  return { r, api, category };
}

const paneer = (categoryId: string) => ({
  categoryId,
  name: "Paneer Tikka",
  nameHi: "पनीर टिक्का",
  dietType: "VEG",
  basePrice: 22_000,
  taxRateBps: 500,
  code: "PT1",
  variants: [
    { name: "Half", price: 14_000 },
    { name: "Full", price: 22_000 },
  ],
});

/** Builds a multipart/form-data body by hand (what a browser sends for <input type=file>). */
function multipart(field: string, filename: string, type: string, bytes: Buffer) {
  const boundary = "----restoos" + Math.random().toString(16).slice(2);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, bytes, tail]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function upload(r: Awaited<ReturnType<typeof restaurant>>, itemId: string, bytes: Buffer) {
  const body = multipart("image", "photo.jpg", "image/jpeg", bytes);
  return h.app.inject({
    method: "PUT",
    url: `/api/owner/menu/items/${itemId}/image`,
    payload: body.payload,
    headers: {
      "content-type": body.contentType,
      origin: ORIGIN,
      "x-outlet-id": r.outletId,
      cookie: [...h.jar].map(([k, v]) => `${k}=${v}`).join("; "),
    },
  });
}

describe("/api/owner/menu", () => {
  it("adds categories and items with sizes and add-ons, and returns the whole menu", async () => {
    const { api, category } = await setup();
    const mains = await category("Mains");
    const drinks = await category("Drinks");
    expect([mains.sortOrder, drinks.sortOrder]).toEqual([0, 1]);

    const extras = addOnGroupSchema.parse(
      (
        await api("POST", "/addon-groups", {
          name: "Extras",
          minSelect: 0,
          maxSelect: 2,
          addOns: [
            { name: "Extra cheese", price: 3_000 },
            { name: "Mint chutney", price: 0 },
          ],
        })
      ).json(),
    );

    const created = await api("POST", "/items", {
      ...paneer(mains.id),
      addOnGroupIds: [extras.id],
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(menuItemSchema.parse(created.json())).toMatchObject({
      name: "Paneer Tikka",
      code: "PT1",
      inStock: true,
      variants: [
        { name: "Half", price: 14_000 },
        { name: "Full", price: 22_000 },
      ],
      addOnGroupIds: [extras.id],
    });

    // Reorder categories: Drinks first.
    expect((await api("PUT", "/categories/order", { ids: [drinks.id, mains.id] })).statusCode).toBe(
      204,
    );
    const menu = ownerMenuSchema.parse((await api("GET", "")).json());
    expect(menu.categories.map((c) => c.name)).toEqual(["Drinks", "Mains"]);
    expect(menu.items).toHaveLength(1);
    expect(menu.addOnGroups[0]?.addOns.map((a) => a.name)).toEqual([
      "Extra cheese",
      "Mint chutney",
    ]);
  });

  it("edits an item: replaces sizes, moves category, hides it", async () => {
    const { api, category } = await setup();
    const mains = await category("Mains");
    const starters = await category("Starters");
    const item = menuItemSchema.parse((await api("POST", "/items", paneer(mains.id))).json());

    const edited = menuItemSchema.parse(
      (
        await api("PATCH", `/items/${item.id}`, {
          basePrice: 24_000,
          categoryId: starters.id,
          variants: [{ name: "Regular", price: 24_000 }],
        })
      ).json(),
    );
    expect(edited).toMatchObject({
      basePrice: 24_000,
      categoryId: starters.id,
      variants: [{ name: "Regular" }],
    });
    expect(await h.prisma.itemVariant.count()).toBe(1);

    const hidden = menuItemSchema.parse(
      (await api("PATCH", `/items/${item.id}`, { isActive: false })).json(),
    );
    expect(hidden.isActive).toBe(false);
    expect(hidden.variants).toHaveLength(1); // untouched when not sent
  });

  it("refuses duplicate codes and rates outside 0/5/18/40 %", async () => {
    const { api, category } = await setup();
    const mains = await category("Mains");
    await api("POST", "/items", paneer(mains.id));
    const dup = await api("POST", "/items", { ...paneer(mains.id), name: "Other" });
    expect([dup.statusCode, code(dup)]).toEqual([409, "CODE_TAKEN"]);
    const bad = await api("POST", "/items", { ...paneer(mains.id), code: "X1", taxRateBps: 1200 });
    expect([bad.statusCode, code(bad)]).toEqual([400, "VALIDATION_ERROR"]);
  });

  it("stores photos as WebP, replaces and removes them", async () => {
    const { r, api, category } = await setup();
    const mains = await category("Mains");
    const item = menuItemSchema.parse((await api("POST", "/items", paneer(mains.id))).json());
    const jpg = await sharp({
      create: { width: 1600, height: 1200, channels: 3, background: "#e4a11b" },
    })
      .jpeg()
      .toBuffer();

    const first = await upload(r, item.id, jpg);
    expect(first.statusCode, first.body).toBe(200);
    const url = menuItemSchema.parse(first.json()).imageUrl ?? "";
    expect(url).toMatch(new RegExp(`^/api/files/menu/${r.outletId}/${item.id}-[0-9a-f]+\\.webp$`));
    const served = await h.app.inject({ method: "GET", url });
    expect(served.headers["content-type"]).toBe("image/webp");
    expect((await sharp(served.rawPayload).metadata()).width).toBe(800);

    const second = menuItemSchema.parse((await upload(r, item.id, jpg)).json()).imageUrl;
    expect(second).not.toBe(url);
    expect((await h.app.inject({ method: "GET", url })).statusCode).toBe(404); // old file gone

    const removed = menuItemSchema.parse((await api("DELETE", `/items/${item.id}/image`)).json());
    expect(removed.imageUrl).toBeNull();
    const files = await readdir(join(h.storageDir, "menu", r.outletId));
    expect(files).toEqual([]);

    const notImage = await upload(r, item.id, Buffer.from("hello"));
    expect([notImage.statusCode, code(notImage)]).toEqual([400, "IMAGE_TYPE"]);
  });

  it("keeps each restaurant's menu to itself", async () => {
    const { api, category } = await setup();
    const mains = await category("Mains");
    const extras = addOnGroupSchema.parse(
      (
        await api("POST", "/addon-groups", {
          name: "Extras",
          minSelect: 0,
          maxSelect: 1,
          addOns: [{ name: "Cheese", price: 3_000 }],
        })
      ).json(),
    );
    const item = menuItemSchema.parse((await api("POST", "/items", paneer(mains.id))).json());

    h.clearCookies();
    const other = await restaurant(h, "+919876500002");
    const theirs = (method: "GET" | "POST" | "PATCH", url: string, body?: object) =>
      other.owner(method, `/api/owner/menu${url}`, body);
    const own = menuCategorySchema.parse(
      (await theirs("POST", "/categories", { name: "Mine" })).json(),
    );

    expect(ownerMenuSchema.parse((await theirs("GET", "")).json()).items).toEqual([]);
    expect(code(await theirs("POST", "/items", paneer(mains.id)))).toBe("NOT_FOUND");
    expect(
      code(await theirs("POST", "/items", { ...paneer(own.id), addOnGroupIds: [extras.id] })),
    ).toBe("NOT_FOUND");
    expect(code(await theirs("PATCH", `/items/${item.id}`, { name: "pwned" }))).toBe("NOT_FOUND");
  });

  it("needs menu.edit: a manager can, a cashier can't", async () => {
    const { r, category } = await setup();
    await category("Mains");
    const meera = await r.addStaff("Meera", "MANAGER", "905172");
    const priya = await r.addStaff("Priya", "CASHIER", "4827");

    const manager = await r.signedInTablet(meera.id, "905172");
    expect((await manager.call("GET", "/api/owner/menu")).statusCode).toBe(200);
    const cashier = await r.signedInTablet(priya.id, "4827");
    const denied = await cashier.call("POST", "/api/owner/menu/categories", { name: "Nope" });
    expect([denied.statusCode, code(denied)]).toEqual([403, "FORBIDDEN"]);
  });

  it("downloads the Excel template and the current menu (M2-T2)", async () => {
    const { r, api, category } = await setup();
    const mains = await category("Mains");
    await api("POST", "/items", paneer(mains.id));

    const template = await api("GET", "/template.xlsx");
    expect(template.statusCode).toBe(200);
    expect(template.headers["content-type"]).toContain("spreadsheetml.sheet");
    expect(template.headers["content-disposition"]).toBe(
      'attachment; filename="restoos-menu-template.xlsx"',
    );
    const blank = await readWorkbook(template.rawPayload);
    expect(blank.getWorksheet("Menu")?.getCell("C2").text).toBe("Paneer Tikka"); // example row

    // Plain links can't send headers: ?outletId= works too (checked against the org).
    const exported = await h.app.inject({
      method: "GET",
      url: `/api/owner/menu/export.xlsx?outletId=${r.outletId}`,
      headers: { cookie: [...h.jar].map(([k, v]) => `${k}=${v}`).join("; ") },
    });
    expect(exported.statusCode).toBe(200);
    const wb = await readWorkbook(exported.rawPayload);
    const sheet = wb.getWorksheet("Menu");
    expect(sheet?.rowCount).toBe(2);
    expect([
      sheet?.getCell("A2").text,
      sheet?.getCell("E2").text,
      sheet?.getCell("H2").text,
    ]).toEqual(["Mains", "PT1", "Half=140, Full=220"]);
    expect(String(wb.getWorksheet("Instructions")?.getCell("A2").text)).toContain("Bandra");
  });

  it("downloads need menu.edit and an outlet", async () => {
    const { r } = await setup();
    const noOutlet = await h.request("GET", "/api/owner/menu/template.xlsx");
    expect([noOutlet.statusCode, code(noOutlet)]).toEqual([400, "OUTLET_REQUIRED"]);
    const priya = await r.addStaff("Priya", "CASHIER", "4827");
    const cashier = await r.signedInTablet(priya.id, "4827");
    expect((await cashier.call("GET", "/api/owner/menu/template.xlsx")).statusCode).toBe(403);
  });

  it("publishes menu.changed after each write", async () => {
    const seen: string[] = [];
    const { api } = await setup();
    const off = h.app.events.subscribe((_ctx, e) => {
      seen.push(e.name);
    });
    await api("POST", "/categories", { name: "Mains" });
    off();
    expect(seen).toEqual(["menu.changed"]);
  });
});
