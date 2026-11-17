import {
  DIET_LABELS,
  formatSizes,
  GST_PERCENT_OPTIONS,
  INSTRUCTIONS_SHEET,
  MENU_IMPORT_COLUMNS,
  MENU_SHEET,
  MENU_TEMPLATE_EXAMPLES,
  rupeesText,
  YES_NO,
  type MenuSheetRow,
  type OwnerMenu,
} from "@restoos/shared";
import ExcelJS from "exceljs";

// exceljs implements range-wide validation (`worksheet.dataValidations.add`, documented in its
// README) but its .d.ts omits it; declare just that method.
declare module "exceljs" {
  interface Worksheet {
    dataValidations: { add(range: string, validation: ExcelJS.DataValidation): void };
  }
}

/** Reads an .xlsx (exceljs's `load` is typed for an old Buffer; an ArrayBuffer is what it uses). */
export async function readWorkbook(bytes: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const copy = new Uint8Array(bytes); // own ArrayBuffer, exactly the file's bytes
  await wb.xlsx.load(copy.buffer);
  return wb;
}

// Excel menu workbook (M2-T2): the empty template (with example rows) and the current-menu export
// share one builder and the shared column contract, so M2-T3 can read either one back.

const LISTS_SHEET = "Lists";
/** Rows that get dropdowns/checks — far more than any restaurant menu. */
const LAST_ROW = 1000;

const colLetter = (key: (typeof MENU_IMPORT_COLUMNS)[number]["key"]) =>
  String.fromCharCode(65 + MENU_IMPORT_COLUMNS.findIndex((c) => c.key === key));

/** The outlet's menu as sheet rows (codes included, so a re-import updates instead of duplicating). */
export function menuToRows(menu: OwnerMenu): MenuSheetRow[] {
  const categories = new Map(menu.categories.map((c) => [c.id, c]));
  const order = new Map(menu.categories.map((c, i) => [c.id, i]));
  return [...menu.items]
    .sort(
      (a, b) =>
        (order.get(a.categoryId) ?? 0) - (order.get(b.categoryId) ?? 0) ||
        a.sortOrder - b.sortOrder,
    )
    .map((item) => ({
      category: categories.get(item.categoryId)?.name ?? "",
      categoryHi: categories.get(item.categoryId)?.nameHi ?? "",
      name: item.name,
      nameHi: item.nameHi ?? "",
      code: item.code ?? "",
      diet: DIET_LABELS[item.dietType],
      price: item.variants.length > 0 ? "" : rupeesText(item.basePrice),
      sizes: formatSizes(item.variants),
      gst: String(item.taxRateBps / 100),
      hsnSac: item.hsnSac ?? "",
      description: item.description ?? "",
      show: item.isActive ? "Yes" : "No",
    }));
}

export async function buildMenuWorkbook({
  outletName,
  rows,
  now = new Date(),
}: {
  outletName: string;
  /** Omitted → the template with example rows. */
  rows?: readonly MenuSheetRow[];
  now?: Date;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "RestoOS";
  wb.created = now;

  // ── Menu ──────────────────────────────────────────────────────────────────
  const sheet = wb.addWorksheet(MENU_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = MENU_IMPORT_COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
  }));
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle" };
  header.height = 22;
  MENU_IMPORT_COLUMNS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.note = `${c.required ? "Required. " : ""}${c.help}`;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: c.required ? "FFFBE3DC" : "FFF1F1F1" },
    };
  });
  for (const row of rows ?? MENU_TEMPLATE_EXAMPLES) sheet.addRow(row);
  // Codes and HSN are text, so leading zeros survive (e.g. "0101").
  for (const key of ["code", "hsnSac", "sizes"] as const) sheet.getColumn(key).numFmt = "@";

  // ── Lists (hidden) feeding the dropdowns ──────────────────────────────────
  const lists = wb.addWorksheet(LISTS_SHEET, { state: "hidden" });
  const dietLabels = Object.values(DIET_LABELS);
  dietLabels.forEach((v, i) => (lists.getCell(i + 1, 1).value = v));
  GST_PERCENT_OPTIONS.forEach((v, i) => (lists.getCell(i + 1, 2).value = v));
  YES_NO.forEach((v, i) => (lists.getCell(i + 1, 3).value = v));

  const dropdown = (
    key: Parameters<typeof colLetter>[0],
    range: string,
    title: string,
    message: string,
  ) =>
    sheet.dataValidations.add(`${colLetter(key)}2:${colLetter(key)}${LAST_ROW}`, {
      type: "list",
      allowBlank: key === "show",
      formulae: [range],
      showErrorMessage: true,
      errorStyle: "stop",
      errorTitle: title,
      error: message,
    });
  dropdown(
    "diet",
    `${LISTS_SHEET}!$A$1:$A$${dietLabels.length}`,
    "Type",
    "Pick Veg, Non-veg or Egg.",
  );
  dropdown(
    "gst",
    `${LISTS_SHEET}!$B$1:$B$${GST_PERCENT_OPTIONS.length}`,
    "GST %",
    "Pick 0, 5, 18 or 40.",
  );
  dropdown("show", `${LISTS_SHEET}!$C$1:$C$${YES_NO.length}`, "Show on Menu", "Pick Yes or No.");
  sheet.dataValidations.add(`${colLetter("price")}2:${colLetter("price")}${LAST_ROW}`, {
    type: "decimal",
    operator: "greaterThan",
    allowBlank: true,
    formulae: [0],
    showErrorMessage: true,
    errorStyle: "stop",
    errorTitle: "Price (₹)",
    error: "Enter the price in rupees, e.g. 220 or 220.50.",
  });

  // ── Instructions ──────────────────────────────────────────────────────────
  const help = wb.addWorksheet(INSTRUCTIONS_SHEET);
  help.getColumn(1).width = 110;
  const lines: [string, boolean?][] = [
    ["RestoOS menu import", true],
    [`Outlet: ${outletName} · made ${now.toISOString().slice(0, 10)}`],
    [""],
    ["How to fill it", true],
    ['1. Use the "Menu" sheet. One row per item. Keep the header row exactly as it is.'],
    ["2. Required: Category, Item Name, Type, GST %, and either Price (₹) or Sizes."],
    ["3. Type, GST % and Show on Menu have dropdowns — pick from the list."],
    ["4. Prices are in rupees: 220 or 220.50 (no ₹ sign needed)."],
    [
      "5. Sizes: name=price pairs separated by commas, e.g. Half=140, Full=220. Leave Price empty then.",
    ],
    ["6. GST: restaurant food is usually 5. Packaged goods may differ — check with your CA."],
    [
      "7. Item Code (optional, up to 10 letters/digits): importing again with the same code UPDATES that item.",
    ],
    ["8. New categories are created automatically; spelling must match to add to an existing one."],
    ["9. Delete the example rows before importing (or keep them if you want those dishes)."],
    [""],
    ["Not in this sheet", true],
    ["• Photos and add-ons (like extra cheese) — set them in the app under Menu."],
    ["• Stock (in/out) — toggle it in the app during service."],
    [""],
    [
      "Upload the file in RestoOS → Menu → Excel. You'll see a preview with any problems before anything is saved.",
    ],
  ];
  lines.forEach(([text, bold], i) => {
    const cell = help.getCell(i + 1, 1);
    cell.value = text;
    cell.alignment = { wrapText: true };
    if (bold) cell.font = { bold: true, size: i === 0 ? 14 : 12 };
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
