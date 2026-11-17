import {
  categoryInputSchema,
  formatINR,
  GST_RATES_BPS,
  IMPORT_MAX_ROWS,
  itemInputSchema,
  MENU_IMPORT_COLUMNS,
  MENU_SHEET,
  parseRupees,
  parseSizes,
  type DietType,
  type ImportPreview,
  type ImportPreviewRow,
  type ImportResult,
  type MenuImportColumn,
  type MenuItem,
  type OwnerMenu,
} from "@restoos/shared";
import type { CellValue } from "exceljs";
import type { TenantContext, TenantDb } from "../../lib/tenant";
import { readWorkbook } from "./template";

// Excel menu import (M2-T3). Pure steps, unit-tested:
//   readMenuSheet(bytes)        → raw rows (or a file-level problem)
//   planImport(rows, menu)      → preview rows + the changes to make
//   applyImport(db, ctx, plan)  → writes them in one transaction
// Matching: Item Code first; otherwise Category + Item Name (case-insensitive), so menus
// without codes don't duplicate on re-import.

type Key = MenuImportColumn["key"];
export type RawRow = { row: number } & Record<Key, string>;
export type SheetResult = { ok: true; rows: RawRow[] } | { ok: false; error: string };

const HEADER = Object.fromEntries(MENU_IMPORT_COLUMNS.map((c) => [c.key, c.header])) as Record<
  Key,
  string
>;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** Any cell → trimmed text (numbers stay readable: 0.05, 220.5). */
function cellText(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(Math.round(value * 1e6) / 1e6);
  if (typeof value === "string") return value.trim();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value)
      return value.richText
        .map((t) => t.text)
        .join("")
        .trim();
    if ("result" in value) return cellText(value.result);
    if ("text" in value && typeof value.text === "string") return value.text.trim();
  }
  return "";
}

export async function readMenuSheet(bytes: Buffer): Promise<SheetResult> {
  let wb;
  try {
    wb = await readWorkbook(bytes);
  } catch {
    return {
      ok: false,
      error: "This isn't an Excel file (.xlsx). Download the template and fill that.",
    };
  }
  const sheet = wb.getWorksheet(MENU_SHEET) ?? wb.worksheets.find((w) => w.state !== "hidden");
  if (!sheet) return { ok: false, error: "The file has no sheets." };

  // Headers in any order, case/space-insensitive; extra columns are ignored.
  const columnOf = new Map<Key, number>();
  sheet.getRow(1).eachCell((cell, col) => {
    const text = norm(cellText(cell.value));
    const column = MENU_IMPORT_COLUMNS.find((c) => norm(c.header) === text);
    if (column && !columnOf.has(column.key)) columnOf.set(column.key, col);
  });
  const missing = MENU_IMPORT_COLUMNS.filter((c) => c.required && !columnOf.has(c.key));
  if (missing.length > 0) {
    const names = missing.map((c) => `‘${c.header}’`).join(", ");
    return {
      ok: false,
      error: `Column ${names} ${missing.length === 1 ? "is" : "are"} missing. Download the template again and keep its header row.`,
    };
  }

  const rows: RawRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const excelRow = sheet.getRow(r);
    const raw = { row: r } as RawRow;
    for (const c of MENU_IMPORT_COLUMNS) {
      const col = columnOf.get(c.key);
      raw[c.key] = col ? cellText(excelRow.getCell(col).value) : "";
    }
    if (MENU_IMPORT_COLUMNS.every((c) => raw[c.key] === "")) continue; // blank row
    rows.push(raw);
    if (rows.length > IMPORT_MAX_ROWS) {
      return {
        ok: false,
        error: `The sheet has more than ${IMPORT_MAX_ROWS} items. Split it into smaller files.`,
      };
    }
  }
  if (rows.length === 0)
    return { ok: false, error: "The sheet has no items. Fill at least one row under the header." };
  return { ok: true, rows };
}

// ── Plan ────────────────────────────────────────────────────────────────────

type ItemFields = {
  name: string;
  nameHi: string | null;
  description: string | null;
  code: string | null;
  hsnSac: string | null;
  dietType: DietType;
  basePrice: number;
  taxRateBps: number;
  isActive: boolean;
  variants: { name: string; price: number }[];
};

export type ImportAction = {
  row: number;
  kind: "create" | "update";
  itemId: string | null;
  /** Lower-cased category name → resolved to an id at apply time. */
  categoryKey: string;
  fields: ItemFields;
};

export type ImportPlan = {
  preview: Omit<ImportPreview, "importId" | "committed">;
  /** Rows to write (new + update); unchanged and error rows aren't here. */
  actions: ImportAction[];
  /** New categories (display name + optional Hindi), by lower-cased name. */
  newCategories: Map<string, { name: string; nameHi: string | null }>;
  /** Existing categories that get their missing Hindi name from the sheet. */
  categoryHindi: Map<string, string>;
};

const DIETS: Record<string, DietType> = { veg: "VEG", nonveg: "NON_VEG", egg: "EGG" };

/** "5", "5%", 0.05 (a %-formatted cell) → 500 bps; null when not a number. */
function gstBps(text: string): number | null {
  const n = Number(text.replace("%", "").trim());
  if (text.trim() === "" || !Number.isFinite(n)) return null;
  const percent = n > 0 && n < 1 ? n * 100 : n;
  return Math.round(percent * 100);
}

const ISSUE_COLUMN: Partial<Record<string, Key>> = {
  name: "name",
  nameHi: "nameHi",
  description: "description",
  code: "code",
  hsnSac: "hsnSac",
  variants: "sizes",
  basePrice: "price",
  taxRateBps: "gst",
  dietType: "diet",
};

const priceText = (f: Pick<ItemFields, "basePrice" | "variants">) =>
  f.variants.length > 0
    ? `from ${formatINR(Math.min(...f.variants.map((v) => v.price)), { paise: "auto" })}`
    : formatINR(f.basePrice, { paise: "auto" });

function diff(
  item: MenuItem,
  categoryKey: string,
  currentCategoryKey: string,
  f: ItemFields,
): string[] {
  const changes: string[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (item.name !== f.name) changes.push("Name");
  if ((item.nameHi ?? null) !== f.nameHi) changes.push("Hindi name");
  if (currentCategoryKey !== categoryKey) changes.push("Category");
  if (item.dietType !== f.dietType) changes.push("Type");
  if (
    !same(
      item.variants.map((v) => ({ name: v.name, price: v.price })),
      f.variants,
    )
  )
    changes.push("Sizes");
  else if (f.variants.length === 0 && item.basePrice !== f.basePrice) changes.push("Price");
  if (item.taxRateBps !== f.taxRateBps) changes.push("GST %");
  if ((item.hsnSac ?? null) !== f.hsnSac) changes.push("HSN/SAC");
  if ((item.code ?? null) !== f.code) changes.push("Item code");
  if ((item.description ?? null) !== f.description) changes.push("Description");
  if (item.isActive !== f.isActive) changes.push(f.isActive ? "Shown again" : "Hidden");
  return changes;
}

export function planImport(rows: RawRow[], menu: OwnerMenu): ImportPlan {
  const catById = new Map(menu.categories.map((c) => [c.id, c]));
  const catKeys = new Map(menu.categories.map((c) => [c.name.toLowerCase(), c]));
  const byCode = new Map(menu.items.filter((i) => i.code).map((i) => [i.code as string, i]));
  const keyOf = (category: string, name: string) =>
    `${category.toLowerCase()}\u0000${name.toLowerCase()}`;
  const byName = new Map(
    menu.items.map((i) => [keyOf(catById.get(i.categoryId)?.name ?? "", i.name), i]),
  );

  // Duplicates inside the file.
  const count = (key: (r: RawRow) => string) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = key(r);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const codeCount = count((r) => r.code.trim().toUpperCase());
  const nameCount = count((r) =>
    r.category && r.name ? keyOf(r.category.trim(), r.name.trim()) : "",
  );

  const preview: ImportPreviewRow[] = [];
  const actions: ImportAction[] = [];
  const newCategories = new Map<string, { name: string; nameHi: string | null }>();
  const categoryHindi = new Map<string, string>();
  const matched = new Set<string>();

  for (const r of rows) {
    const messages: { column: string | null; message: string }[] = [];
    const add = (key: Key | null, message: string) => {
      const column = key ? HEADER[key] : null;
      if (!messages.some((m) => m.column === column)) messages.push({ column, message });
    };

    // Lenient reading first…
    const category = r.category.trim();
    const cat = categoryInputSchema.safeParse({ name: category, nameHi: r.categoryHi });
    if (!cat.success)
      add(
        "category",
        category === ""
          ? "Enter a category, e.g. Starters"
          : (cat.error.issues[0]?.message ?? "Check the category"),
      );
    const diet = DIETS[norm(r.diet).replace(/[-_]/g, "")];
    if (!diet) add("diet", "Pick Veg, Non-veg or Egg");
    const rate = gstBps(r.gst);
    if (rate === null || !(GST_RATES_BPS as readonly number[]).includes(rate))
      add("gst", "Use 0, 5, 18 or 40");
    const sizes = parseSizes(r.sizes);
    if (!sizes.ok) add("sizes", sizes.error);
    let basePrice = 0;
    if (sizes.ok && sizes.sizes.length > 0) {
      basePrice = Math.min(...sizes.sizes.map((s) => s.price));
    } else if (r.price.trim() === "") {
      if (sizes.ok) add("price", "Enter a price in rupees, e.g. 220 (or fill Sizes)");
    } else {
      try {
        basePrice = parseRupees(r.price);
      } catch {
        add("price", "Write the price as a number, e.g. 220 or 220.50");
      }
    }
    const show = norm(r.show);
    if (show !== "" && show !== "yes" && show !== "no")
      add("show", "Use Yes or No (empty means Yes)");

    // …then the same rules as the menu editor (rule 10).
    const parsed = itemInputSchema.safeParse({
      categoryId: "sheet",
      name: r.name,
      nameHi: r.nameHi,
      description: r.description,
      code: r.code,
      // Blank stays blank (bills fall back to the restaurant SAC), so re-imports don't show a
      // fake change on items that never had one.
      hsnSac: r.hsnSac,
      dietType: diet ?? "VEG",
      basePrice: basePrice || 1,
      taxRateBps: rate ?? 500,
      isActive: show !== "no",
      variants: sizes.ok ? sizes.sizes : [],
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = ISSUE_COLUMN[String(issue.path[0])];
        if (key)
          add(key, key === "name" && r.name.trim() === "" ? "Enter the item name" : issue.message);
      }
    }

    const code = parsed.success ? (parsed.data.code ?? null) : null;
    if (code && (codeCount.get(code) ?? 0) > 1)
      add("code", `Code ${code} is used on more than one row`);
    if (category && r.name.trim() && (nameCount.get(keyOf(category, r.name.trim())) ?? 0) > 1) {
      add("name", "This item appears more than once in this category");
    }

    // Which existing item does this row describe?
    let existing: MenuItem | undefined;
    if (parsed.success && messages.length === 0) {
      const byItsCode = code ? byCode.get(code) : undefined;
      const byItsName = byName.get(keyOf(category, parsed.data.name));
      existing = byItsCode ?? byItsName;
      if (byItsCode && byItsName && byItsCode.id !== byItsName.id) {
        // The code says one item, the category + name say another: renaming onto an existing
        // dish would create a duplicate, so ask the owner which one they meant.
        add("code", `Code ${code} already belongs to “${byItsCode.name}”`);
      } else if (existing && matched.has(existing.id)) {
        add(null, `Another row already updates “${existing.name}”`);
      }
    }

    const shownName = r.name.trim() || "(no name)";
    if (!parsed.success || messages.length > 0) {
      preview.push({
        row: r.row,
        status: "error",
        name: shownName,
        category,
        price: "",
        changes: [],
        messages,
      });
      continue;
    }

    const d = parsed.data;
    const fields: ItemFields = {
      name: d.name,
      nameHi: d.nameHi ?? null,
      description: d.description ?? null,
      code: d.code ?? null,
      hsnSac: d.hsnSac ?? null,
      dietType: d.dietType,
      basePrice: d.basePrice,
      taxRateBps: d.taxRateBps,
      isActive: d.isActive,
      variants: d.variants,
    };
    const categoryKey = category.toLowerCase();
    const knownCategory = catKeys.get(categoryKey);
    if (!knownCategory && !newCategories.has(categoryKey)) {
      newCategories.set(categoryKey, {
        name: category,
        nameHi: cat.success ? (cat.data.nameHi ?? null) : null,
      });
    }
    if (knownCategory && !knownCategory.nameHi && cat.success && cat.data.nameHi) {
      categoryHindi.set(knownCategory.id, cat.data.nameHi);
    }

    if (existing) {
      matched.add(existing.id);
      const currentKey = (catById.get(existing.categoryId)?.name ?? "").toLowerCase();
      const changes = diff(existing, categoryKey, currentKey, fields);
      preview.push({
        row: r.row,
        status: changes.length > 0 ? "update" : "unchanged",
        name: fields.name,
        category,
        price: priceText(fields),
        changes,
        messages: [],
      });
      if (changes.length > 0) {
        actions.push({ row: r.row, kind: "update", itemId: existing.id, categoryKey, fields });
      }
    } else {
      preview.push({
        row: r.row,
        status: "new",
        name: fields.name,
        category,
        price: priceText(fields),
        changes: [],
        messages: [],
      });
      actions.push({ row: r.row, kind: "create", itemId: null, categoryKey, fields });
    }
  }

  const tally = (s: ImportPreviewRow["status"]) => preview.filter((p) => p.status === s).length;
  return {
    preview: {
      counts: {
        rows: preview.length,
        new: tally("new"),
        update: tally("update"),
        unchanged: tally("unchanged"),
        error: tally("error"),
      },
      newCategories: [...newCategories.values()].map((c) => c.name),
      rows: preview,
    },
    actions,
    newCategories,
    categoryHindi,
  };
}

// ── Apply ───────────────────────────────────────────────────────────────────

/** Writes the plan in one transaction (all or nothing). */
export async function applyImport(
  db: TenantDb,
  ctx: TenantContext,
  outletId: string,
  plan: ImportPlan,
): Promise<ImportResult> {
  const organizationId = ctx.organizationId;
  return db.$transaction(
    async (tx) => {
      const categories = await tx.menuCategory.findMany({
        select: { id: true, name: true, sortOrder: true },
      });
      const idByKey = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
      let nextCategoryOrder = Math.max(-1, ...categories.map((c) => c.sortOrder)) + 1;

      // Only categories some written row needs (validOnly may drop the rest).
      const needed = new Set(plan.actions.map((a) => a.categoryKey));
      let categoriesAdded = 0;
      for (const [key, c] of plan.newCategories) {
        if (!needed.has(key) || idByKey.has(key)) continue;
        const created = await tx.menuCategory.create({
          data: {
            organizationId,
            outletId,
            name: c.name,
            nameHi: c.nameHi,
            sortOrder: nextCategoryOrder++,
          },
          select: { id: true },
        });
        idByKey.set(key, created.id);
        categoriesAdded++;
      }
      for (const [id, nameHi] of plan.categoryHindi) {
        await tx.menuCategory.update({ where: { id }, data: { nameHi } });
      }

      const lastOrder = new Map<string, number>();
      const nextItemOrder = async (categoryId: string) => {
        if (!lastOrder.has(categoryId)) {
          const last = await tx.menuItem.findFirst({
            where: { categoryId },
            select: { sortOrder: true },
            orderBy: { sortOrder: "desc" },
          });
          lastOrder.set(categoryId, last?.sortOrder ?? -1);
        }
        const next = (lastOrder.get(categoryId) ?? -1) + 1;
        lastOrder.set(categoryId, next);
        return next;
      };

      let added = 0;
      let updated = 0;
      for (const a of plan.actions) {
        const categoryId = idByKey.get(a.categoryKey);
        if (!categoryId) throw new Error(`category for row ${a.row} wasn't created`);
        const { variants, ...fields } = a.fields;
        const variantRows = variants.map((v, sortOrder) => ({
          organizationId,
          name: v.name,
          price: v.price,
          sortOrder,
        }));
        if (a.kind === "create") {
          await tx.menuItem.create({
            data: {
              organizationId,
              outletId,
              categoryId,
              ...fields,
              sortOrder: await nextItemOrder(categoryId),
              variants: { create: variantRows },
            },
          });
          added++;
        } else if (a.itemId) {
          // Sizes come from the sheet; add-ons and the photo are left as they are.
          await tx.itemVariant.deleteMany({ where: { itemId: a.itemId } });
          await tx.menuItem.update({
            where: { id: a.itemId },
            data: { categoryId, ...fields, variants: { create: variantRows } },
          });
          updated++;
        }
      }
      const { counts } = plan.preview;
      return {
        added,
        updated,
        unchanged: counts.unchanged,
        skipped: counts.error,
        categoriesAdded,
      };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}
