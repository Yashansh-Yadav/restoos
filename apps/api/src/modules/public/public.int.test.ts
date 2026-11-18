// M2-T5: GET /api/public/table/:qrToken — the cached customer menu, fresh after every change.
import { randomBytes } from "node:crypto";
import { seedPlans } from "@restoos/db/testing";
import {
  apiErrorSchema,
  menuCategorySchema,
  menuItemSchema,
  publicMenuSchema,
} from "@restoos/shared";
import { afterEach, describe, expect, it } from "vitest";
import { createAuthHarness } from "../../test/auth-harness";
import { restaurant } from "../../test/restaurant";

type Harness = Awaited<ReturnType<typeof createAuthHarness>>;
let h: Harness;

afterEach(async () => {
  await h.close();
});

/** A table with a QR token (the floor editor arrives in M3; create it directly). */
async function table(r: Awaited<ReturnType<typeof restaurant>>, label = "T1") {
  const section = await h.prisma.section.create({
    data: { organizationId: r.organizationId, outletId: r.outletId, name: `Hall ${label}` },
  });
  const qrToken = randomBytes(16).toString("base64url");
  await h.prisma.diningTable.create({
    data: {
      organizationId: r.organizationId,
      outletId: r.outletId,
      sectionId: section.id,
      label,
      qrToken,
    },
  });
  return qrToken;
}

async function setup(phone?: string) {
  await seedPlans(h.prisma);
  const r = await restaurant(h, phone);
  const menu = (method: "POST" | "PATCH", url: string, body: object) =>
    r.owner(method, `/api/owner/menu${url}`, body);
  const mains = menuCategorySchema.parse(
    (await menu("POST", "/categories", { name: "Mains" })).json(),
  );
  const add = async (name: string, over: object = {}) =>
    menuItemSchema.parse(
      (
        await menu("POST", "/items", {
          categoryId: mains.id,
          name,
          dietType: "VEG",
          basePrice: 24_000,
          taxRateBps: 500,
          code: name.slice(0, 3).toUpperCase(),
          ...over,
        })
      ).json(),
    );
  const dal = await add("Dal Makhani");
  const token = await table(r);
  const get = async (t = token) => {
    const res = await h.app.inject({ method: "GET", url: `/api/public/table/${t}` });
    return res;
  };
  const read = async () => publicMenuSchema.parse((await get()).json());
  return { r, menu, mains, add, dal, token, get, read };
}

describe("GET /api/public/table/:qrToken", () => {
  it("returns outlet, table and the visible menu without internal fields — no login", async () => {
    h = await createAuthHarness();
    const { menu, add, get } = await setup();
    const hidden = await add("Old Special");
    await menu("PATCH", `/items/${hidden.id}`, { isActive: false });
    await add("Paneer Tikka", {
      variants: [
        { name: "Half", price: 14_000 },
        { name: "Full", price: 22_000 },
      ],
    });

    h.clearCookies(); // the customer has no session
    const res = await get();
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    const body = publicMenuSchema.parse(res.json());
    expect(body.outlet).toEqual({
      name: "Bandra",
      orderingMode: "VIEW_ONLY",
      pricesIncludeTax: false,
      googleReviewUrl: null,
    });
    expect(body.table).toEqual({ label: "T1" });
    expect(body.menu.categories[0]?.items.map((i) => [i.name, i.price])).toEqual([
      ["Dal Makhani", 24_000],
      ["Paneer Tikka", 14_000],
    ]);
    expect(res.body).not.toMatch(/taxRateBps|hsnSac|"code"|Old Special/);
  });

  it("serves from the cache, and every kind of change is visible at once", async () => {
    h = await createAuthHarness();
    const { r, menu, dal, read } = await setup();
    expect((await read()).menu.categories[0]?.items[0]?.price).toBe(24_000);

    // A direct database change that publishes no event is NOT seen: proof we're on the cache.
    await h.prisma.menuItem.update({ where: { id: dal.id }, data: { basePrice: 99_900 } });
    expect((await read()).menu.categories[0]?.items[0]?.price).toBe(24_000);

    // Menu edit through the API (menu.changed) → fresh immediately.
    await menu("PATCH", `/items/${dal.id}`, { basePrice: 26_000 });
    expect((await read()).menu.categories[0]?.items[0]?.price).toBe(26_000);

    // Stock toggle (menu.stockChanged) → greyed out immediately, still listed.
    await r.owner("PUT", `/api/staff/menu/items/${dal.id}/stock`, { inStock: false });
    expect((await read()).menu.categories[0]?.items[0]).toMatchObject({
      name: "Dal Makhani",
      inStock: false,
    });

    // Outlet setting (outlet.settingsChanged) → busts too.
    await h.prisma.outlet.update({
      where: { id: r.outletId },
      data: { orderingMode: "SELF_ORDER" },
    });
    expect((await read()).outlet.orderingMode).toBe("VIEW_ONLY"); // cached
    await r.owner("PATCH", "/api/owner/outlet/settings", { autoStartShift: false });
    expect((await read()).outlet.orderingMode).toBe("SELF_ORDER");
  });

  it("answers 404 for unknown or junk tokens", async () => {
    h = await createAuthHarness();
    await setup();
    for (const t of [
      randomBytes(16).toString("base64url"),
      "short",
      "../../etc/passwd",
      "a".repeat(80),
    ]) {
      const res = await h.app.inject({
        method: "GET",
        url: `/api/public/table/${encodeURIComponent(t)}`,
      });
      expect(res.statusCode, t).toBe(404);
      if (t !== "a".repeat(80))
        expect(apiErrorSchema.parse(res.json()).error.code).toBe("TABLE_NOT_FOUND");
    }
  });

  it("keeps each restaurant's menu (and cache) separate", async () => {
    h = await createAuthHarness();
    const a = await setup("+919876500001");
    expect((await a.read()).outlet.name).toBe("Bandra");

    h.clearCookies();
    const other = await restaurant(h, "+919876500002");
    await h.prisma.outlet.update({ where: { id: other.outletId }, data: { name: "Andheri" } });
    const tokenB = await table(other, "B1");
    const b = publicMenuSchema.parse((await a.get(tokenB)).json());
    expect(b.outlet.name).toBe("Andheri");
    expect(b.menu.categories).toEqual([]); // B has no menu; A's dishes never leak
    expect((await a.read()).menu.categories[0]?.items[0]?.name).toBe("Dal Makhani");
  });
});
