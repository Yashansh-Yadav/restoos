import type { DietType, OrderingMode, PrismaClient } from "@restoos/db";
import { QR_TOKEN_FORMAT, type PublicOutletMenu } from "@restoos/shared";
import type { Redis } from "./redis";
import { createTenantDbFactory } from "./tenant";

// Customer menu for a table QR (M2-T5, plan §7). The busiest endpoint in the product, so the
// outlet's menu is cached in Redis; any menu, stock or outlet-settings change busts it.
//
// Cache keys (version-safe, so a slow read can't re-cache a stale menu after a change):
//   pubmenu:{outletId}:ver          version number, INCR on bust
//   pubmenu:{outletId}:{ver}        the JSON for that version (1 h TTL as a safety net)
// A reader stores what it built under the version it read *before* building; after a bust that
// key is never read again. If Redis is down we build from the database — never fail the menu.

const TTL_SECONDS = 3600;
const keys = {
  version: (outletId: string) => `pubmenu:${outletId}:ver`,
  payload: (outletId: string, version: string) => `pubmenu:${outletId}:${version}`,
};

export type PublicTable = { organizationId: string; outletId: string; label: string };

// ── Pure builder (unit-tested) ──────────────────────────────────────────────

export type MenuRows = {
  outlet: {
    name: string;
    orderingMode: OrderingMode;
    pricesIncludeTax: boolean;
    googleReviewUrl: string | null;
  };
  categories: {
    id: string;
    name: string;
    nameHi: string | null;
    isActive: boolean;
    items: {
      id: string;
      name: string;
      nameHi: string | null;
      description: string | null;
      dietType: DietType;
      basePrice: number;
      imageUrl: string | null;
      inStock: boolean;
      isActive: boolean;
      variants: { id: string; name: string; price: number }[];
      addOnGroups: { groupId: string }[];
    }[];
  }[];
  addOnGroups: {
    id: string;
    name: string;
    minSelect: number;
    maxSelect: number;
    addOns: { id: string; name: string; price: number }[];
  }[];
};

/** Visible dishes only; out-of-stock ones stay (greyed out); only the add-on groups in use. */
export function shapePublicMenu(rows: MenuRows): PublicOutletMenu {
  const categories = rows.categories
    .filter((c) => c.isActive)
    .map((c) => ({
      id: c.id,
      name: c.name,
      nameHi: c.nameHi,
      items: c.items
        .filter((i) => i.isActive)
        .map((i) => ({
          id: i.id,
          name: i.name,
          nameHi: i.nameHi,
          description: i.description,
          dietType: i.dietType,
          price: i.variants.length > 0 ? Math.min(...i.variants.map((v) => v.price)) : i.basePrice,
          variants: i.variants,
          addOnGroupIds: i.addOnGroups.map((g) => g.groupId),
          imageUrl: i.imageUrl,
          inStock: i.inStock,
        })),
    }))
    .filter((c) => c.items.length > 0);
  const used = new Set(categories.flatMap((c) => c.items.flatMap((i) => i.addOnGroupIds)));
  return {
    outlet: rows.outlet,
    menu: { categories, addOnGroups: rows.addOnGroups.filter((g) => used.has(g.id)) },
  };
}

// ── Cache (unit-tested with a fake Redis) ───────────────────────────────────

type Log = (event: string, data: Record<string, unknown>) => void;
export type CacheRedis = Pick<Redis, "get" | "set" | "incr">;

/** Cached read, version-safe; builds from the database when Redis is unavailable. */
export async function readThrough<T>(
  redis: CacheRedis,
  outletId: string,
  build: () => Promise<T>,
  log: Log = () => undefined,
): Promise<T> {
  let version: string;
  try {
    version = (await redis.get(keys.version(outletId))) ?? "0";
    const cached = await redis.get(keys.payload(outletId, version));
    if (cached) return JSON.parse(cached) as T;
  } catch (err) {
    log("public_menu.cache_unavailable", { outletId, err: String(err) });
    return build(); // never fail the menu because the cache is down
  }
  const fresh = await build();
  try {
    // Stored under the version read *before* building: if a bust happened meanwhile, this
    // (possibly stale) copy sits under the old version and is never served.
    await redis.set(keys.payload(outletId, version), JSON.stringify(fresh), "EX", TTL_SECONDS);
  } catch (err) {
    log("public_menu.cache_unavailable", { outletId, err: String(err) });
  }
  return fresh;
}

/** Invalidate an outlet's cached menu (new version). */
export async function bustOutlet(redis: CacheRedis, outletId: string, log: Log = () => undefined) {
  try {
    await redis.incr(keys.version(outletId));
  } catch (err) {
    // The payload TTL still caps how long a stale menu could live.
    log("public_menu.bust_failed", { outletId, err: String(err) });
  }
}

// ── Service ─────────────────────────────────────────────────────────────────

export type PublicMenuService = ReturnType<typeof createPublicMenu>;

export function createPublicMenu({
  prisma,
  redis,
  log = () => undefined,
}: {
  prisma: PrismaClient;
  redis: Redis;
  log?: (event: string, data: Record<string, unknown>) => void;
}) {
  const getTenantDb = createTenantDbFactory(prisma);

  /** Uncached on purpose: a rotated or removed QR stops working at once. */
  async function findTable(qrToken: string): Promise<PublicTable | null> {
    if (!QR_TOKEN_FORMAT.test(qrToken)) return null;
    return prisma.diningTable.findUnique({
      where: { qrToken },
      select: { organizationId: true, outletId: true, label: true },
    });
  }

  async function build(table: PublicTable): Promise<PublicOutletMenu> {
    const db = getTenantDb({
      organizationId: table.organizationId,
      outletId: table.outletId,
      actor: { kind: "system", reason: "public-menu" },
    });
    const [outlet, categories, addOnGroups] = await Promise.all([
      db.outlet.findUniqueOrThrow({
        where: { id: table.outletId },
        select: { name: true, orderingMode: true, pricesIncludeTax: true, googleReviewUrl: true },
      }),
      db.menuCategory.findMany({
        select: {
          id: true,
          name: true,
          nameHi: true,
          isActive: true,
          items: {
            select: {
              id: true,
              name: true,
              nameHi: true,
              description: true,
              dietType: true,
              basePrice: true,
              imageUrl: true,
              inStock: true,
              isActive: true,
              variants: {
                select: { id: true, name: true, price: true },
                orderBy: { sortOrder: "asc" },
              },
              addOnGroups: { select: { groupId: true } },
            },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      db.addOnGroup.findMany({
        select: {
          id: true,
          name: true,
          minSelect: true,
          maxSelect: true,
          addOns: { select: { id: true, name: true, price: true }, orderBy: { createdAt: "asc" } },
        },
        orderBy: { name: "asc" },
      }),
    ]);
    return shapePublicMenu({ outlet, categories, addOnGroups });
  }

  /** The outlet's customer menu, from Redis when possible. */
  const getOutletMenu = (table: PublicTable) =>
    readThrough(redis, table.outletId, () => build(table), log);
  const bust = (outletId: string) => bustOutlet(redis, outletId, log);

  return { findTable, getOutletMenu, bust };
}
