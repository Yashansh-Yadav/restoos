import { randomBytes } from "node:crypto";
import type {
  ImportPreview,
  ImportResult,
  StockList,
  addOnGroupInputSchema,
  categoryInputSchema,
  categoryUpdateSchema,
  itemInputSchema,
  itemUpdateSchema,
  MenuItem,
  OwnerMenu,
} from "@restoos/shared";
import type { z } from "zod";
import { AppError, notFound } from "../../lib/errors";
import type { EventBus } from "../../lib/events";
import { processMenuImage } from "../../lib/images";
import { keyFromPublicUrl, type FileStorage } from "../../lib/storage";
import { applyImport, planImport, readMenuSheet } from "./import";
import type { TenantContext, TenantDb } from "../../lib/tenant";

// Menu editing (M2-T1). Everything goes through the tenant client, so ids from another
// restaurant (category, add-on group, item) are "not found". Nested rows (sizes, add-ons, links)
// set organizationId themselves — the tenant client doesn't rewrite nested writes (M1-T3).
// Items and categories are hidden, never deleted: orders and bills reference them.

export type MenuDeps = {
  db: TenantDb;
  ctx: TenantContext;
  storage: FileStorage;
  events: EventBus;
};

type CategoryInput = z.output<typeof categoryInputSchema>;
type CategoryUpdate = z.output<typeof categoryUpdateSchema>;
type ItemInput = z.output<typeof itemInputSchema>;
type ItemUpdate = z.output<typeof itemUpdateSchema>;
type GroupInput = z.output<typeof addOnGroupInputSchema>;

function outletId(ctx: TenantContext): string {
  if (!ctx.outletId) throw new AppError(400, "OUTLET_REQUIRED", "Choose an outlet first");
  return ctx.outletId;
}

const changed = (deps: MenuDeps) =>
  deps.events.publishEvent(deps.ctx, "menu.changed", { outletId: outletId(deps.ctx) });

const isUniqueViolation = (err: unknown) =>
  err instanceof Error && "code" in err && err.code === "P2002";

const itemSelect = {
  id: true,
  categoryId: true,
  name: true,
  nameHi: true,
  description: true,
  code: true,
  hsnSac: true,
  dietType: true,
  basePrice: true,
  taxRateBps: true,
  imageUrl: true,
  inStock: true,
  isActive: true,
  sortOrder: true,
  variants: { select: { id: true, name: true, price: true }, orderBy: { sortOrder: "asc" } },
  addOnGroups: { select: { groupId: true } },
} as const;

type ItemRow = Omit<MenuItem, "addOnGroupIds"> & { addOnGroups: { groupId: string }[] };
const toItem = ({ addOnGroups, ...row }: ItemRow): MenuItem => ({
  ...row,
  addOnGroupIds: addOnGroups.map((g) => g.groupId),
});

// ── Read ────────────────────────────────────────────────────────────────────

export async function getMenu({ db, ctx }: MenuDeps): Promise<OwnerMenu> {
  outletId(ctx);
  const [categories, items, addOnGroups] = await Promise.all([
    db.menuCategory.findMany({
      select: { id: true, name: true, nameHi: true, sortOrder: true, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.menuItem.findMany({ select: itemSelect, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
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
  return { categories, items: items.map(toItem), addOnGroups };
}

// ── Categories ──────────────────────────────────────────────────────────────

export async function createCategory(deps: MenuDeps, input: CategoryInput) {
  const outlet = outletId(deps.ctx);
  const last = await deps.db.menuCategory.findFirst({
    select: { sortOrder: true },
    orderBy: { sortOrder: "desc" },
  });
  const row = await deps.db.menuCategory.create({
    data: {
      organizationId: deps.ctx.organizationId,
      outletId: outlet,
      name: input.name,
      nameHi: input.nameHi ?? null,
      isActive: input.isActive,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
    select: { id: true, name: true, nameHi: true, sortOrder: true, isActive: true },
  });
  changed(deps);
  return row;
}

export async function updateCategory(deps: MenuDeps, id: string, input: CategoryUpdate) {
  const found = await deps.db.menuCategory.findUnique({ where: { id }, select: { id: true } });
  if (!found) throw notFound("Category");
  const row = await deps.db.menuCategory.update({
    where: { id },
    data: input,
    select: { id: true, name: true, nameHi: true, sortOrder: true, isActive: true },
  });
  changed(deps);
  return row;
}

/** Saves the category order shown on screen (every id must be this outlet's). */
export async function reorderCategories(deps: MenuDeps, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)];
  const owned = await deps.db.menuCategory.count({ where: { id: { in: unique } } });
  if (owned !== unique.length) throw notFound("Category");
  await deps.db.$transaction(
    unique.map((id, sortOrder) =>
      deps.db.menuCategory.update({ where: { id }, data: { sortOrder } }),
    ),
  );
  changed(deps);
}

// ── Add-on groups ───────────────────────────────────────────────────────────

const groupSelect = {
  id: true,
  name: true,
  minSelect: true,
  maxSelect: true,
  addOns: { select: { id: true, name: true, price: true }, orderBy: { createdAt: "asc" } },
} as const;

const addOnRows = (organizationId: string, addOns: GroupInput["addOns"]) =>
  addOns.map((a) => ({ organizationId, name: a.name, price: a.price }));

export async function createAddOnGroup(deps: MenuDeps, input: GroupInput) {
  const row = await deps.db.addOnGroup.create({
    data: {
      organizationId: deps.ctx.organizationId,
      outletId: outletId(deps.ctx),
      name: input.name,
      minSelect: input.minSelect,
      maxSelect: input.maxSelect,
      addOns: { create: addOnRows(deps.ctx.organizationId, input.addOns) },
    },
    select: groupSelect,
  });
  changed(deps);
  return row;
}

export async function updateAddOnGroup(deps: MenuDeps, id: string, input: GroupInput) {
  const found = await deps.db.addOnGroup.findUnique({ where: { id }, select: { id: true } });
  if (!found) throw notFound("Add-on group");
  // Order lines keep their own add-on snapshot, so replacing the list is safe.
  const row = await deps.db.$transaction(async (tx) => {
    await tx.addOn.deleteMany({ where: { groupId: id } });
    return tx.addOnGroup.update({
      where: { id },
      data: {
        name: input.name,
        minSelect: input.minSelect,
        maxSelect: input.maxSelect,
        addOns: { create: addOnRows(deps.ctx.organizationId, input.addOns) },
      },
      select: groupSelect,
    });
  });
  changed(deps);
  return row;
}

export async function deleteAddOnGroup(deps: MenuDeps, id: string): Promise<void> {
  const found = await deps.db.addOnGroup.findUnique({ where: { id }, select: { id: true } });
  if (!found) throw notFound("Add-on group");
  await deps.db.addOnGroup.delete({ where: { id } }); // add-ons and item links cascade
  changed(deps);
}

// ── Items ───────────────────────────────────────────────────────────────────

async function assertCategory(db: TenantDb, id: string) {
  if (!(await db.menuCategory.findUnique({ where: { id }, select: { id: true } }))) {
    throw notFound("Category");
  }
}

async function assertGroups(db: TenantDb, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return unique;
  const owned = await db.addOnGroup.count({ where: { id: { in: unique } } });
  if (owned !== unique.length) throw notFound("Add-on group");
  return unique;
}

const variantRows = (organizationId: string, variants: ItemInput["variants"]) =>
  variants.map((v, sortOrder) => ({ organizationId, name: v.name, price: v.price, sortOrder }));

const codeTaken = () =>
  new AppError(409, "CODE_TAKEN", "Another item already uses this code. Pick a different one.");

export async function createItem(deps: MenuDeps, input: ItemInput): Promise<MenuItem> {
  const { db, ctx } = deps;
  await assertCategory(db, input.categoryId);
  const groupIds = await assertGroups(db, input.addOnGroupIds);
  const last = await db.menuItem.findFirst({
    where: { categoryId: input.categoryId },
    select: { sortOrder: true },
    orderBy: { sortOrder: "desc" },
  });
  try {
    const row = await db.menuItem.create({
      data: {
        organizationId: ctx.organizationId,
        outletId: outletId(ctx),
        categoryId: input.categoryId,
        name: input.name,
        nameHi: input.nameHi ?? null,
        description: input.description ?? null,
        code: input.code ?? null,
        hsnSac: input.hsnSac ?? null,
        dietType: input.dietType,
        basePrice: input.basePrice,
        taxRateBps: input.taxRateBps,
        isActive: input.isActive,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        variants: { create: variantRows(ctx.organizationId, input.variants) },
        addOnGroups: {
          create: groupIds.map((groupId) => ({ organizationId: ctx.organizationId, groupId })),
        },
      },
      select: itemSelect,
    });
    changed(deps);
    return toItem(row);
  } catch (err) {
    if (isUniqueViolation(err)) throw codeTaken();
    throw err;
  }
}

export async function updateItem(deps: MenuDeps, id: string, input: ItemUpdate): Promise<MenuItem> {
  const { db, ctx } = deps;
  if (!(await db.menuItem.findUnique({ where: { id }, select: { id: true } }))) {
    throw notFound("Item");
  }
  if (input.categoryId) await assertCategory(db, input.categoryId);
  const groupIds = input.addOnGroupIds ? await assertGroups(db, input.addOnGroupIds) : undefined;
  const { variants, addOnGroupIds: _ids, ...fields } = input;
  try {
    const row = await db.$transaction(async (tx) => {
      if (variants) await tx.itemVariant.deleteMany({ where: { itemId: id } });
      if (groupIds) await tx.itemAddOnGroup.deleteMany({ where: { itemId: id } });
      return tx.menuItem.update({
        where: { id },
        data: {
          ...fields,
          ...(variants && { variants: { create: variantRows(ctx.organizationId, variants) } }),
          ...(groupIds && {
            addOnGroups: {
              create: groupIds.map((groupId) => ({ organizationId: ctx.organizationId, groupId })),
            },
          }),
        },
        select: itemSelect,
      });
    });
    changed(deps);
    return toItem(row);
  } catch (err) {
    if (isUniqueViolation(err)) throw codeTaken();
    throw err;
  }
}

// ── Photos ──────────────────────────────────────────────────────────────────

export async function setItemImage(deps: MenuDeps, id: string, upload: Buffer): Promise<MenuItem> {
  const { db, ctx, storage } = deps;
  const item = await db.menuItem.findUnique({ where: { id }, select: { imageUrl: true } });
  if (!item) throw notFound("Item");
  const webp = await processMenuImage(upload);
  // A new key per upload: browsers and CDNs can cache images forever.
  const key = `menu/${outletId(ctx)}/${id}-${randomBytes(6).toString("hex")}.webp`;
  await storage.put(key, webp, "image/webp");
  const row = await db.menuItem.update({
    where: { id },
    data: { imageUrl: storage.publicUrl(key) },
    select: itemSelect,
  });
  const old = keyFromPublicUrl(item.imageUrl);
  if (old) await storage.delete(old);
  changed(deps);
  return toItem(row);
}

export async function removeItemImage(deps: MenuDeps, id: string): Promise<MenuItem> {
  const { db, storage } = deps;
  const item = await db.menuItem.findUnique({ where: { id }, select: { imageUrl: true } });
  if (!item) throw notFound("Item");
  const row = await db.menuItem.update({
    where: { id },
    data: { imageUrl: null },
    select: itemSelect,
  });
  const old = keyFromPublicUrl(item.imageUrl);
  if (old) await storage.delete(old);
  changed(deps);
  return toItem(row);
}

// ── Excel import (M2-T3) ────────────────────────────────────────────────────

const actorId = (ctx: TenantContext) =>
  ctx.actor.kind === "owner"
    ? ctx.actor.userId
    : ctx.actor.kind === "staff"
      ? ctx.actor.employeeId
      : "system";

async function planFromFile(deps: MenuDeps, bytes: Buffer) {
  const sheet = await readMenuSheet(bytes);
  if (!sheet.ok) throw new AppError(400, "IMPORT_FILE", sheet.error);
  return planImport(sheet.rows, await getMenu(deps));
}

/** Upload: store the file, record the import, return the preview. Nothing on the menu changes. */
export async function uploadImport(deps: MenuDeps, bytes: Buffer): Promise<ImportPreview> {
  const { db, ctx, storage } = deps;
  const outlet = outletId(ctx);
  const plan = await planFromFile(deps, bytes);
  // Private key (not under a public prefix): /api/files never serves imports.
  const key = `imports/${outlet}/${randomBytes(12).toString("hex")}.xlsx`;
  await storage.put(
    key,
    bytes,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  const errors = plan.preview.rows.flatMap((r) =>
    r.messages.map((m) => ({ row: r.row, column: m.column, message: m.message })),
  );
  const record = await db.menuImport.create({
    data: {
      organizationId: ctx.organizationId,
      outletId: outlet,
      fileUrl: key,
      status: "VALIDATED",
      rowCount: plan.preview.counts.rows,
      errorCount: plan.preview.counts.error,
      errors,
      createdById: actorId(ctx),
    },
    select: { id: true },
  });
  return { importId: record.id, committed: false, ...plan.preview };
}

async function findImport(deps: MenuDeps, id: string) {
  const record = await deps.db.menuImport.findUnique({
    where: { id },
    select: { id: true, fileUrl: true, status: true },
  });
  if (!record) throw notFound("Import");
  const file = await deps.storage.read(record.fileUrl);
  if (!file)
    throw new AppError(
      410,
      "IMPORT_EXPIRED",
      "This upload is no longer available. Upload the file again.",
    );
  return { record, bytes: file.bytes };
}

/** Preview again (e.g. after a reload): re-checked against the menu as it is now. */
export async function getImportPreview(deps: MenuDeps, id: string): Promise<ImportPreview> {
  const { record, bytes } = await findImport(deps, id);
  const plan = await planFromFile(deps, bytes);
  return { importId: record.id, committed: record.status === "COMMITTED", ...plan.preview };
}

/**
 * Commit: re-validates the stored file against the current menu, then writes everything in one
 * transaction. `all` refuses while any row has a problem; `validOnly` skips those rows.
 */
export async function commitImport(
  deps: MenuDeps,
  id: string,
  mode: "all" | "validOnly",
): Promise<ImportResult> {
  const { record, bytes } = await findImport(deps, id);
  if (record.status === "COMMITTED") {
    throw new AppError(
      409,
      "ALREADY_IMPORTED",
      "This file was already imported. Upload it again to re-import.",
    );
  }
  const plan = await planFromFile(deps, bytes);
  const { error } = plan.preview.counts;
  if (mode === "all" && error > 0) {
    throw new AppError(
      400,
      "IMPORT_HAS_ERRORS",
      `${error} ${error === 1 ? "row has a problem" : "rows have problems"}. Fix them, or import the valid rows only.`,
      { errorCount: error },
    );
  }
  const result = await applyImport(deps.db, deps.ctx, outletId(deps.ctx), plan);
  await deps.db.menuImport.update({ where: { id }, data: { status: "COMMITTED" } });
  changed(deps);
  return result;
}

// ── Stock (M2-T4) ───────────────────────────────────────────────────────────

/** Visible items of visible categories, for the one-tap stock screen. */
export async function getStockList({ db, ctx }: MenuDeps): Promise<StockList> {
  outletId(ctx);
  const categories = await db.menuCategory.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      nameHi: true,
      items: {
        where: { isActive: true },
        select: { id: true, name: true, nameHi: true, dietType: true, inStock: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return { categories: categories.filter((c) => c.items.length > 0) };
}

/** In / out of stock. Idempotent; publishes menu.stockChanged (and menu.changed for caches). */
export async function setStock(
  deps: MenuDeps,
  id: string,
  inStock: boolean,
): Promise<{ id: string; inStock: boolean }> {
  const outlet = outletId(deps.ctx);
  const found = await deps.db.menuItem.findUnique({ where: { id }, select: { id: true } });
  if (!found) throw notFound("Item");
  const row = await deps.db.menuItem.update({
    where: { id },
    data: { inStock },
    select: { id: true, inStock: true },
  });
  deps.events.publishEvent(deps.ctx, "menu.stockChanged", {
    outletId: outlet,
    itemId: id,
    inStock,
  });
  changed(deps);
  return row;
}
