// M2-T3: reading the sheet, the row rules and matching — on real .xlsx files built with exceljs.
import {
  MENU_IMPORT_COLUMNS,
  MENU_TEMPLATE_EXAMPLES,
  type MenuSheetRow,
  type OwnerMenu,
} from "@restoos/shared";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { planImport, readMenuSheet, type RawRow } from "./import";
import { buildMenuWorkbook } from "./template";

const empty: OwnerMenu = { categories: [], items: [], addOnGroups: [] };

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

async function sheetRows(rows: MenuSheetRow[]): Promise<RawRow[]> {
  const result = await readMenuSheet(await buildMenuWorkbook({ outletName: "Bandra", rows }));
  if (!result.ok) throw new Error(result.error);
  return result.rows;
}

/** A hand-made workbook (custom headers/cell types) for the lenient-reading tests. */
async function customSheet(headers: string[], data: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Menu");
  ws.addRow(headers);
  for (const d of data) ws.addRow(d);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("acceptance: 3 bad rows → exactly those 3 errors", () => {
  it("flags only the bad rows, with Excel row numbers and the column to fix", async () => {
    const rows = await sheetRows([
      row({ name: "Dal Makhani" }), // row 2 ok
      row({ name: "Bad GST", gst: "12" }), // row 3
      row({ name: "Paneer Tikka", price: "", sizes: "Half=140, Full=220" }), // row 4 ok
      row({ name: "No Price", price: "" }), // row 5
      row({ name: "Bad Type", diet: "Vegan" }), // row 6
      row({ name: "Masala Papad", category: "Starters", price: "60" }), // row 7 ok
    ]);
    const plan = planImport(rows, empty);
    const errors = plan.preview.rows.filter((r) => r.status === "error");
    expect(errors.map((e) => [e.row, e.messages.map((m) => m.column)])).toEqual([
      [3, ["GST %"]],
      [5, ["Price (₹)"]],
      [6, ["Type"]],
    ]);
    expect(plan.preview.counts).toEqual({ rows: 6, new: 3, update: 0, unchanged: 0, error: 3 });
    expect(plan.actions.map((a) => a.row)).toEqual([2, 4, 7]);
    expect(plan.preview.newCategories).toEqual(["Mains", "Starters"]);
    expect(errors[0]?.messages[0]?.message).toBe("Use 0, 5, 18 or 40");
  });
});

describe("readMenuSheet", () => {
  it("reads headers in any order and case, ignores extra columns and blank rows", async () => {
    const file = await customSheet(
      ["gst %", "NOTES", "item name", "Category", "Type", "price (₹)"],
      [
        [5, "ignore me", "Lassi", "Drinks", "veg", 80],
        [],
        [18, "", "Water", "Drinks", "Veg", "40"],
      ],
    );
    const result = await readMenuSheet(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows.map((r) => [r.row, r.name, r.gst, r.price])).toEqual([
        [2, "Lassi", "5", "80"],
        [4, "Water", "18", "40"],
      ]);
    }
  });

  it("explains missing columns and non-Excel files", async () => {
    const noGst = await customSheet(
      ["Category", "Item Name", "Type", "Price (₹)"],
      [["A", "B", "Veg", 1]],
    );
    const errorOf = async (bytes: Buffer) => {
      const result = await readMenuSheet(bytes);
      return result.ok ? null : result.error;
    };
    expect(await errorOf(noGst)).toContain("‘GST %’ is missing");
    expect(await errorOf(Buffer.from("name,price\nDal,240"))).toContain("isn't an Excel file");
    const headerOnly = await customSheet(
      MENU_IMPORT_COLUMNS.map((c) => c.header),
      [],
    );
    expect(await errorOf(headerOnly)).toContain("no items");
  });

  it("reads the template's own example rows as valid new items", async () => {
    const result = await readMenuSheet(await buildMenuWorkbook({ outletName: "Bandra" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const plan = planImport(result.rows, empty);
    expect(plan.preview.counts).toMatchObject({ new: MENU_TEMPLATE_EXAMPLES.length, error: 0 });
  });
});

describe("planImport: lenient values", () => {
  it("accepts 5%, %-formatted 0.05, numeric codes/HSN and 'non veg'", async () => {
    const file = await customSheet(
      ["Category", "Item Name", "Item Code", "Type", "Price (₹)", "GST %", "HSN/SAC"],
      [
        ["Mains", "A", "101", "non veg", 100, "5%", 996331],
        ["Mains", "B", "", "NON-VEG", "100.50", 0.05, ""],
        ["Mains", "C", "", "Egg", 90, 0.18, ""],
      ],
    );
    const read = await readMenuSheet(file);
    if (!read.ok) throw new Error(read.error);
    const plan = planImport(read.rows, empty);
    expect(plan.preview.counts.error).toBe(0);
    expect(
      plan.actions.map((a) => [
        a.fields.code,
        a.fields.dietType,
        a.fields.taxRateBps,
        a.fields.basePrice,
        a.fields.hsnSac,
      ]),
    ).toEqual([
      ["101", "NON_VEG", 500, 10_000, "996331"],
      [null, "NON_VEG", 500, 10_050, null],
      [null, "EGG", 1_800, 9_000, null],
    ]);
  });

  it("flags duplicates inside the file on every copy", async () => {
    const plan = planImport(
      await sheetRows([
        row({ name: "A", code: "X1" }),
        row({ name: "B", code: "X1" }),
        row({ name: "Dal" }),
        row({ name: "dal" }),
      ]),
      empty,
    );
    expect(plan.preview.rows.map((r) => r.status)).toEqual(["error", "error", "error", "error"]);
  });
});

describe("planImport: matching existing items", () => {
  const menu: OwnerMenu = {
    categories: [
      { id: "c1", name: "Mains", nameHi: null, sortOrder: 0, isActive: true },
      { id: "c2", name: "Starters", nameHi: null, sortOrder: 1, isActive: true },
    ],
    items: [
      {
        id: "i1",
        categoryId: "c1",
        name: "Dal Makhani",
        nameHi: null,
        description: null,
        code: "MN1",
        hsnSac: null,
        dietType: "VEG",
        basePrice: 24_000,
        taxRateBps: 500,
        imageUrl: "/api/files/menu/x.webp",
        inStock: true,
        isActive: true,
        sortOrder: 0,
        variants: [],
        addOnGroupIds: ["g1"],
      },
      {
        id: "i2",
        categoryId: "c2",
        name: "Papad",
        nameHi: null,
        description: null,
        code: null,
        hsnSac: null,
        dietType: "VEG",
        basePrice: 6_000,
        taxRateBps: 500,
        imageUrl: null,
        inStock: true,
        isActive: true,
        sortOrder: 0,
        variants: [],
        addOnGroupIds: [],
      },
    ],
    addOnGroups: [],
  };

  it("matches by code first (even under a new name), then by category + name", async () => {
    const plan = planImport(
      await sheetRows([
        row({ name: "Dal Makhani (Special)", code: "MN1", price: "260" }),
        row({ category: "starters", name: "papad", price: "60" }),
        row({ category: "Starters", name: "Papad Masala", price: "80" }),
      ]),
      menu,
    );
    expect(plan.preview.rows.map((r) => [r.status, r.changes])).toEqual([
      ["update", ["Name", "Price"]],
      ["update", ["Name"]], // "papad" vs "Papad"
      ["new", []],
    ]);
    expect(plan.actions[0]).toMatchObject({ kind: "update", itemId: "i1" });
    expect(plan.preview.newCategories).toEqual([]);
  });

  it("reports unchanged rows and doesn't plan a write for them", async () => {
    const plan = planImport(
      await sheetRows([row({ name: "Dal Makhani", code: "MN1", price: "240" })]),
      menu,
    );
    expect(plan.preview.rows[0]?.status).toBe("unchanged");
    expect(plan.actions).toEqual([]);
  });

  it("refuses a code that belongs to a different item", async () => {
    const plan = planImport(
      await sheetRows([row({ category: "Starters", name: "Papad", code: "MN1", price: "60" })]),
      menu,
    );
    expect(plan.preview.rows[0]).toMatchObject({
      status: "error",
      messages: [{ column: "Item Code", message: "Code MN1 already belongs to “Dal Makhani”" }],
    });
  });
});
