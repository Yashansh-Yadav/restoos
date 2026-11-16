import { describe, expect, it } from "vitest";
import {
  financialYear,
  formatInvoiceNumber,
  GST_STATES,
  gstinCheckChar,
  gstStateName,
  isValidGstin,
  suggestOutletCode,
} from "./india";

describe("GSTIN", () => {
  // Published example GSTINs whose check characters are known to be correct.
  const valid = ["27AAPFU0939F1ZV", "29AAGCB7383J1Z4"];

  it("accepts GSTINs with a correct check character", () => {
    for (const g of valid) expect(isValidGstin(g), g).toBe(true);
  });

  it("rejects single-character typos (checksum)", () => {
    const g = "27AAPFU0939F1ZV";
    for (let i = 0; i < 14; i++) {
      const c = g.charAt(i);
      const typo = /\d/.test(c) ? String((Number(c) + 1) % 10) : c === "Z" ? "Y" : "Z";
      const mutated = g.slice(0, i) + typo + g.slice(i + 1);
      expect(isValidGstin(mutated), mutated).toBe(false);
    }
  });

  it("rejects bad formats", () => {
    for (const g of ["", "27AAPFU0939F1Z", "27aapfu0939f1zv", "27AAPFU0939F1AV", "XXAAPFU0939F1ZV"]) {
      expect(isValidGstin(g), g).toBe(false);
    }
  });

  it("computes the check character", () => {
    expect(gstinCheckChar("27AAPFU0939F1Z")).toBe("V");
  });
});

describe("GST states", () => {
  it("has unique two-digit codes and looks names up", () => {
    const codes = GST_STATES.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c).toMatch(/^\d{2}$/);
    expect(gstStateName("27")).toBe("Maharashtra");
    expect(gstStateName("29")).toBe("Karnataka");
    expect(gstStateName("25")).toBeUndefined();
  });
});

describe("invoice numbers", () => {
  it("formats exactly 16 characters: A1-2627-D1000045", () => {
    const n = formatInvoiceNumber("A1", "2627", "D1", 45);
    expect(n).toBe("A1-2627-D1000045");
    expect(n).toHaveLength(16);
    expect(formatInvoiceNumber("ST", "2627", "D2", 999_999)).toHaveLength(16);
  });

  it("rejects codes and sequences that would break the 16-char limit", () => {
    expect(() => formatInvoiceNumber("ABC", "2627", "D1", 1)).toThrow(RangeError);
    expect(() => formatInvoiceNumber("A1", "2627", "D10", 1)).toThrow(RangeError);
    expect(() => formatInvoiceNumber("A1", "2627", "D1", 1_000_000)).toThrow(RangeError);
    expect(() => formatInvoiceNumber("A1", "26", "D1", 1)).toThrow(RangeError);
  });

  it("uses the Indian financial year (Apr–Mar, IST)", () => {
    expect(financialYear(new Date("2026-04-01T00:00:00+05:30"))).toBe("2627");
    expect(financialYear(new Date("2027-03-31T23:59:00+05:30"))).toBe("2627");
    expect(financialYear(new Date("2026-03-31T23:59:00+05:30"))).toBe("2526");
    // 31 Mar 19:00 UTC is already 1 Apr in India.
    expect(financialYear(new Date("2027-03-31T19:00:00Z"))).toBe("2728");
    expect(financialYear(new Date("2099-06-01T00:00:00+05:30"))).toBe("9900");
  });
});

describe("suggestOutletCode", () => {
  it("suggests two characters from the brand name", () => {
    expect(suggestOutletCode("Saffron Table")).toBe("ST");
    expect(suggestOutletCode("Annapurna")).toBe("AN");
    expect(suggestOutletCode("the 7 spice co.")).toBe("T7");
    expect(suggestOutletCode("!")).toBe("A1");
  });
});
