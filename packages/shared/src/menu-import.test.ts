import { describe, expect, it } from "vitest";
import { GST_RATES_BPS } from "./menu";
import {
  formatSizes,
  GST_PERCENT_OPTIONS,
  MENU_IMPORT_COLUMNS,
  MENU_TEMPLATE_EXAMPLES,
  parseSizes,
  rupeesText,
} from "./menu-import";

describe("menu sheet contract", () => {
  it("has unique keys and headers, and examples for every column", () => {
    expect(new Set(MENU_IMPORT_COLUMNS.map((c) => c.key)).size).toBe(MENU_IMPORT_COLUMNS.length);
    expect(new Set(MENU_IMPORT_COLUMNS.map((c) => c.header)).size).toBe(MENU_IMPORT_COLUMNS.length);
    for (const row of MENU_TEMPLATE_EXAMPLES) {
      expect(Object.keys(row).sort()).toEqual(MENU_IMPORT_COLUMNS.map((c) => c.key).sort());
    }
  });

  it("offers exactly the allowed GST rates", () => {
    expect(GST_PERCENT_OPTIONS).toEqual(GST_RATES_BPS.map((b) => String(b / 100)));
    expect(GST_PERCENT_OPTIONS).toEqual(["0", "5", "18", "40"]);
  });
});

describe("parseSizes / formatSizes", () => {
  it("reads name=price pairs in rupees", () => {
    expect(parseSizes(" Half = 140 , Full=₹220.50 ")).toEqual({
      ok: true,
      sizes: [
        { name: "Half", price: 14_000 },
        { name: "Full", price: 22_050 },
      ],
    });
    expect(parseSizes("Small=90; Large=150")).toMatchObject({ ok: true });
    expect(parseSizes("")).toEqual({ ok: true, sizes: [] });
  });

  it.each([
    ["Half 140", "should look like Half=140"],
    ["Half=abc", "should be a number"],
    ["Half=0", "more than 0"],
    ["Half=140, half=150", "appears twice"],
    ["=140", "should look like Half=140"],
  ])("explains what's wrong with %s", (input, message) => {
    const r = parseSizes(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(message);
  });

  it("round-trips through formatSizes", () => {
    const sizes = [
      { name: "Half", price: 14_000 },
      { name: "Full", price: 22_050 },
    ];
    expect(formatSizes(sizes)).toBe("Half=140, Full=220.50");
    expect(parseSizes(formatSizes(sizes))).toEqual({ ok: true, sizes });
    expect(rupeesText(5)).toBe("0.05");
  });
});
