// M2-T5: the customer menu shape, and the version-safe Redis cache (with a fake Redis).
import { describe, expect, it, vi } from "vitest";
import {
  bustOutlet,
  readThrough,
  shapePublicMenu,
  type CacheRedis,
  type MenuRows,
} from "./public-menu";

const item = (over: Partial<MenuRows["categories"][number]["items"][number]>) => ({
  id: "i",
  name: "Dish",
  nameHi: null,
  description: null,
  dietType: "VEG" as const,
  basePrice: 20_000,
  imageUrl: null,
  inStock: true,
  isActive: true,
  variants: [],
  addOnGroups: [],
  ...over,
});

const rows: MenuRows = {
  outlet: {
    name: "Bandra",
    orderingMode: "VIEW_ONLY",
    pricesIncludeTax: false,
    googleReviewUrl: null,
  },
  categories: [
    {
      id: "c1",
      name: "Mains",
      nameHi: null,
      isActive: true,
      items: [
        item({
          id: "paneer",
          variants: [
            { id: "v1", name: "Half", price: 14_000 },
            { id: "v2", name: "Full", price: 22_000 },
          ],
          addOnGroups: [{ groupId: "g-used" }],
        }),
        item({ id: "dal", inStock: false }),
        item({ id: "old", isActive: false, addOnGroups: [{ groupId: "g-hidden-only" }] }),
      ],
    },
    { id: "c2", name: "Seasonal", nameHi: null, isActive: false, items: [item({ id: "mango" })] },
    {
      id: "c3",
      name: "Empty",
      nameHi: null,
      isActive: true,
      items: [item({ id: "x", isActive: false })],
    },
  ],
  addOnGroups: [
    {
      id: "g-used",
      name: "Extras",
      minSelect: 0,
      maxSelect: 1,
      addOns: [{ id: "a1", name: "Cheese", price: 3_000 }],
    },
    { id: "g-hidden-only", name: "Old", minSelect: 0, maxSelect: 1, addOns: [] },
    { id: "g-unused", name: "Unused", minSelect: 0, maxSelect: 1, addOns: [] },
  ],
};

describe("shapePublicMenu", () => {
  it("keeps visible dishes (out-of-stock included), drops hidden/empty, prices sized items from the smallest", () => {
    const menu = shapePublicMenu(rows);
    expect(menu.menu.categories.map((c) => [c.name, c.items.map((i) => i.id)])).toEqual([
      ["Mains", ["paneer", "dal"]],
    ]);
    const [paneer, dal] = menu.menu.categories[0]?.items ?? [];
    expect(paneer).toMatchObject({ price: 14_000, addOnGroupIds: ["g-used"] });
    expect(dal).toMatchObject({ price: 20_000, inStock: false });
    expect(menu.menu.addOnGroups.map((g) => g.id)).toEqual(["g-used"]);
    // Nothing internal leaks.
    expect(JSON.stringify(menu)).not.toMatch(/basePrice|isActive|taxRate|hsn|"code"/);
  });
});

/** A tiny in-memory Redis with just get/set/incr. */
function fakeRedis(): CacheRedis & { store: Map<string, string> } {
  const store = new Map<string, string>();
  const redis = {
    store,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
      return "OK" as const;
    }),
    incr: vi.fn(async (k: string) => {
      const n = Number(store.get(k) ?? 0) + 1;
      store.set(k, String(n));
      return n;
    }),
  };
  return redis;
}

describe("readThrough / bustOutlet", () => {
  it("builds once, then serves from the cache until busted", async () => {
    const redis = fakeRedis();
    let n = 0;
    const build = vi.fn(async () => ({ n: ++n }));
    expect(await readThrough(redis, "o1", build)).toEqual({ n: 1 });
    expect(await readThrough(redis, "o1", build)).toEqual({ n: 1 });
    expect(build).toHaveBeenCalledTimes(1);

    await bustOutlet(redis, "o1");
    expect(await readThrough(redis, "o1", build)).toEqual({ n: 2 });
    // Other outlets have their own keys.
    expect(await readThrough(redis, "o2", build)).toEqual({ n: 3 });
  });

  it("never serves a copy built before a bust that happened during the build", async () => {
    const redis = fakeRedis();
    let n = 0;
    // The first build is slow: the menu changes (bust) while it's running.
    const slowStale = async () => {
      await bustOutlet(redis, "o1");
      return { n: ++n, stale: true };
    };
    expect(await readThrough(redis, "o1", slowStale)).toEqual({ n: 1, stale: true });
    // The next reader must not get that stale copy.
    const fresh = await readThrough(redis, "o1", async () => ({ n: ++n, stale: false }));
    expect(fresh).toEqual({ n: 2, stale: false });
  });

  it("falls back to the database when Redis is down, and a failed bust doesn't throw", async () => {
    const down = {
      get: vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))),
      set: vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))),
      incr: vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))),
    } as unknown as CacheRedis;
    const log = vi.fn();
    expect(await readThrough(down, "o1", async () => ({ ok: true }), log)).toEqual({ ok: true });
    await expect(bustOutlet(down, "o1", log)).resolves.toBeUndefined();
    expect(log.mock.calls.map((c) => c[0] as string)).toEqual([
      "public_menu.cache_unavailable",
      "public_menu.bust_failed",
    ]);
  });
});
