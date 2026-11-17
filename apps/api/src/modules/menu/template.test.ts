// M2-T2: the Excel template/export round-trips through exceljs with the agreed columns and lists.
import {
  GST_PERCENT_OPTIONS,
  MENU_IMPORT_COLUMNS,
  MENU_TEMPLATE_EXAMPLES,
  type OwnerMenu,
} from "@restoos/shared";
import { describe, expect, it } from "vitest";
import { buildMenuWorkbook, menuToRows, readWorkbook } from "./template";

const read = readWorkbook;

describe("buildMenuWorkbook", () => {
  it("builds the template: headers, examples, frozen header, instructions", async () => {
    const wb = await read(await buildMenuWorkbook({ outletName: "Bandra" }));
    expect(wb.worksheets.map((w) => [w.name, w.state])).toEqual([
      ["Menu", "visible"],
      ["Lists", "hidden"],
      ["Instructions", "visible"],
    ]);
    const menu = wb.getWorksheet("Menu");
    expect(menu?.getRow(1).values).toEqual([
      undefined,
      ...MENU_IMPORT_COLUMNS.map((c) => c.header),
    ]);
    expect(menu?.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(menu?.rowCount).toBe(1 + MENU_TEMPLATE_EXAMPLES.length);
    expect(menu?.getCell("C2").value).toBe("Paneer Tikka");
    expect(wb.getWorksheet("Instructions")?.getCell("A2").text ?? "").toContain("Bandra");
  });

  it("validates Type, GST % and Show on Menu from the hidden lists", async () => {
    const wb = await read(await buildMenuWorkbook({ outletName: "Bandra" }));
    const lists = wb.getWorksheet("Lists");
    expect([1, 2, 3].map((r) => lists?.getCell(r, 1).value)).toEqual(["Veg", "Non-veg", "Egg"]);
    expect(GST_PERCENT_OPTIONS.map((_, i) => lists?.getCell(i + 1, 2).text)).toEqual(
      GST_PERCENT_OPTIONS,
    );
    const menu = wb.getWorksheet("Menu");
    // Type is column F, GST % column I.
    expect(menu?.getCell("F500").dataValidation).toMatchObject({
      type: "list",
      formulae: ["Lists!$A$1:$A$3"],
    });
    expect(menu?.getCell("I2").dataValidation).toMatchObject({
      type: "list",
      formulae: ["Lists!$B$1:$B$4"],
    });
    expect(menu?.getCell("G2").dataValidation).toMatchObject({ type: "decimal" });
  });

  it("exports the current menu with codes, sizes and rupee prices", async () => {
    const menu: OwnerMenu = {
      categories: [
        { id: "c1", name: "Starters", nameHi: "स्टार्टर", sortOrder: 0, isActive: true },
        { id: "c2", name: "Drinks", nameHi: null, sortOrder: 1, isActive: true },
      ],
      items: [
        {
          id: "i2",
          categoryId: "c2",
          name: "Soda",
          nameHi: null,
          description: null,
          code: "DR1",
          hsnSac: "2202",
          dietType: "VEG",
          basePrice: 6_050,
          taxRateBps: 4_000,
          imageUrl: null,
          inStock: true,
          isActive: false,
          sortOrder: 0,
          variants: [],
          addOnGroupIds: [],
        },
        {
          id: "i1",
          categoryId: "c1",
          name: "Paneer Tikka",
          nameHi: "पनीर टिक्का",
          description: "Grilled",
          code: "ST1",
          hsnSac: null,
          dietType: "VEG",
          basePrice: 14_000,
          taxRateBps: 500,
          imageUrl: null,
          inStock: true,
          isActive: true,
          sortOrder: 0,
          variants: [
            { id: "v1", name: "Half", price: 14_000 },
            { id: "v2", name: "Full", price: 22_000 },
          ],
          addOnGroupIds: [],
        },
      ],
      addOnGroups: [],
    };
    const rows = menuToRows(menu);
    expect(rows.map((r) => r.name)).toEqual(["Paneer Tikka", "Soda"]); // category order
    expect(rows[0]).toMatchObject({
      price: "",
      sizes: "Half=140, Full=220",
      gst: "5",
      categoryHi: "स्टार्टर",
    });
    expect(rows[1]).toMatchObject({ price: "60.50", gst: "40", show: "No", code: "DR1" });

    const wb = await read(await buildMenuWorkbook({ outletName: "Bandra", rows }));
    expect(wb.getWorksheet("Menu")?.rowCount).toBe(3);
    expect(wb.getWorksheet("Menu")?.getCell("H2").value).toBe("Half=140, Full=220");
  });
});
