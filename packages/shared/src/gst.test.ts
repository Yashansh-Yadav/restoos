import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { calculateBill, splitInclusive, taxOn, type BillInput, type BillLineInput } from "./gst";

const line = (
  id: string,
  unitPrice: number,
  taxRateBps: number,
  extra: Partial<BillLineInput> = {},
) => ({
  id,
  unitPrice,
  quantity: 1,
  taxRateBps,
  ...extra,
});

// Worked examples: every number below is calculated by hand in the comments (paise; 500 bps = 5%).

describe("calculateBill — worked examples", () => {
  it("single 5% item, prices exclusive of tax", () => {
    // ₹280 Paneer Tikka: CGST = SGST = 2.5% × 28000 = 700 → 29400, no round-off
    const r = calculateBill({ pricesIncludeTax: false, lines: [line("a", 28_000, 500)] });
    expect(r).toMatchObject({
      subtotal: 28_000,
      taxableTotal: 28_000,
      cgstTotal: 700,
      sgstTotal: 700,
      igstTotal: 0,
      roundOff: 0,
      grandTotal: 29_400,
    });
  });

  it("single 5% item, prices inclusive of tax: taxable + tax == menu price", () => {
    // 28000 / 1.05 = 26666.67 → est 26667; half = 2.5% × 26667 = 666.675 → 667
    // taxable = 28000 − 2 × 667 = 26666; total stays exactly ₹280.00
    const r = calculateBill({ pricesIncludeTax: true, lines: [line("a", 28_000, 500)] });
    expect(r.lines[0]).toMatchObject({
      net: 28_000,
      taxable: 26_666,
      cgst: 667,
      sgst: 667,
      total: 28_000,
    });
    expect(r.grandTotal).toBe(28_000);
    expect(r.roundOff).toBe(0);
  });

  it("multi-rate bill: 5% food + 18% water + 28% soft drink, with per-rate breakup", () => {
    // food 38000 → half 950; water 2 × 4000 = 8000 at 18% → half 720; can 6000 at 28% → half 840
    // taxable 52000 + taxes 2 × 2510 = 57020 → rounds to 57000 (round-off −20)
    const r = calculateBill({
      pricesIncludeTax: false,
      lines: [
        line("food", 38_000, 500),
        line("water", 4_000, 1_800, { quantity: 2 }),
        line("can", 6_000, 2_800),
      ],
    });
    expect(r.taxBreakup).toEqual([
      { taxRateBps: 500, taxable: 38_000, cgst: 950, sgst: 950, igst: 0 },
      { taxRateBps: 1_800, taxable: 8_000, cgst: 720, sgst: 720, igst: 0 },
      { taxRateBps: 2_800, taxable: 6_000, cgst: 840, sgst: 840, igst: 0 },
    ]);
    expect(r).toMatchObject({
      taxableTotal: 52_000,
      cgstTotal: 2_510,
      sgstTotal: 2_510,
      roundOff: -20,
      grandTotal: 57_000,
    });
  });

  it("item discounts: 10% off one line, ₹50 off another", () => {
    // A: 30000 − 10% (3000) = 27000 → half 675; B: 2 × 12000 = 24000 − 5000 = 19000 → half 475
    // taxable 46000 + 2 × 1150 = 48300
    const r = calculateBill({
      pricesIncludeTax: false,
      lines: [
        line("a", 30_000, 500, { discount: { kind: "PERCENT", bps: 1_000 } }),
        line("b", 12_000, 500, { quantity: 2, discount: { kind: "AMOUNT", paise: 5_000 } }),
      ],
    });
    expect(r.lines.map((l) => [l.itemDiscount, l.net])).toEqual([
      [3_000, 27_000],
      [5_000, 19_000],
    ]);
    expect(r).toMatchObject({
      discountTotal: 8_000,
      taxableTotal: 46_000,
      cgstTotal: 1_150,
      grandTotal: 48_300,
    });
  });

  it("caps an item ₹ discount at the line amount (complimentary item = zero, no tax)", () => {
    const r = calculateBill({
      pricesIncludeTax: false,
      lines: [
        line("comp", 15_000, 500, { discount: { kind: "PERCENT", bps: 10_000 } }),
        line("over", 5_000, 500, { discount: { kind: "AMOUNT", paise: 99_999 } }),
        line("paid", 10_000, 500),
      ],
    });
    expect(r.lines.map((l) => l.total)).toEqual([0, 0, 10_500]);
    expect(r.discountTotal).toBe(20_000);
    expect(r.taxBreakup).toEqual([
      { taxRateBps: 500, taxable: 10_000, cgst: 250, sgst: 250, igst: 0 },
    ]);
  });

  it("spreads a bill % discount proportionally across mixed-rate lines", () => {
    // base 30000 + 10000 = 40000, 10% = 4000 → shares 3000 / 1000
    // A 27000 at 5% → half 675; B 9000 at 18% → half 810; 36000 + 2970 = 38970 → 39000 (+30)
    const r = calculateBill({
      pricesIncludeTax: false,
      lines: [line("a", 30_000, 500), line("b", 10_000, 1_800)],
      billDiscount: { kind: "PERCENT", bps: 1_000 },
    });
    expect(r.lines.map((l) => l.billDiscount)).toEqual([3_000, 1_000]);
    expect(r).toMatchObject({
      discountTotal: 4_000,
      taxableTotal: 36_000,
      cgstTotal: 1_485,
      roundOff: 30,
      grandTotal: 39_000,
    });
  });

  it("splits an uneven bill ₹ discount exactly (largest remainder) and caps it at the bill", () => {
    const three = [line("a", 10_000, 500), line("b", 10_000, 500), line("c", 10_000, 500)];
    const r = calculateBill({
      pricesIncludeTax: false,
      lines: three,
      billDiscount: { kind: "AMOUNT", paise: 100 },
    });
    expect(r.lines.map((l) => l.billDiscount)).toEqual([34, 33, 33]);

    const capped = calculateBill({
      pricesIncludeTax: false,
      lines: three,
      billDiscount: { kind: "AMOUNT", paise: 9_999_999 },
    });
    expect(capped).toMatchObject({ discountTotal: 30_000, taxableTotal: 0, grandTotal: 0 });
  });

  it("charges GST on the optional service charge at each line's rate", () => {
    // food taxable 20000 (5%) + 10000 (18%) = 30000; 10% service charge = 3000 → 2000 / 1000
    // A: half(20000) 500 + half(2000) 50 = 550; B: half(10000) 900 + half(1000) 90 = 990
    // taxable 33000 + 2 × 1540 = 36080 → 36100 (+20)
    const input: BillInput = {
      pricesIncludeTax: false,
      lines: [line("a", 20_000, 500), line("b", 10_000, 1_800)],
      serviceChargeBps: 1_000,
    };
    const r = calculateBill(input);
    expect(r.lines.map((l) => [l.serviceCharge, l.cgst])).toEqual([
      [2_000, 550],
      [1_000, 990],
    ]);
    expect(r.taxBreakup).toEqual([
      { taxRateBps: 500, taxable: 22_000, cgst: 550, sgst: 550, igst: 0 },
      { taxRateBps: 1_800, taxable: 11_000, cgst: 990, sgst: 990, igst: 0 },
    ]);
    expect(r).toMatchObject({
      serviceCharge: 3_000,
      taxableTotal: 33_000,
      cgstTotal: 1_540,
      roundOff: 20,
      grandTotal: 36_100,
    });

    // removed at billing time → no charge and no tax on it
    const removed = calculateBill({ ...input, serviceChargeBps: 0 });
    expect(removed.serviceCharge).toBe(0);
    expect(removed.taxableTotal).toBe(30_000);
  });

  it("applies the service charge to the pre-tax value when prices include tax", () => {
    // inclusive 28000 → taxable 26666 (see above); 10% → 2667; tax on it half(2667) = 66.675 → 67
    const r = calculateBill({
      pricesIncludeTax: true,
      lines: [line("a", 28_000, 500)],
      serviceChargeBps: 1_000,
    });
    expect(r.lines[0]).toMatchObject({
      taxable: 26_666,
      serviceCharge: 2_667,
      cgst: 667 + 67,
      sgst: 667 + 67,
    });
  });

  it("supports IGST for inter-state supply", () => {
    const ex = calculateBill({
      pricesIncludeTax: false,
      taxType: "IGST",
      lines: [line("a", 28_000, 500)],
    });
    expect(ex).toMatchObject({ cgstTotal: 0, sgstTotal: 0, igstTotal: 1_400, grandTotal: 29_400 });
    expect(ex.taxBreakup).toEqual([
      { taxRateBps: 500, taxable: 28_000, cgst: 0, sgst: 0, igst: 1_400 },
    ]);

    // inclusive: 28000 / 1.05 → 26667 taxable + 1333 IGST
    const inc = calculateBill({
      pricesIncludeTax: true,
      taxType: "IGST",
      lines: [line("a", 28_000, 500)],
    });
    expect(inc.lines[0]).toMatchObject({ taxable: 26_667, igst: 1_333, total: 28_000 });
  });

  it("rounds to the nearest rupee: .50 goes up, .49 goes down, exact stays", () => {
    const at = (p: number) => calculateBill({ pricesIncludeTax: false, lines: [line("x", p, 0)] });
    expect(at(12_550)).toMatchObject({ roundOff: 50, grandTotal: 12_600 });
    expect(at(12_549)).toMatchObject({ roundOff: -49, grandTotal: 12_500 });
    expect(at(12_500)).toMatchObject({ roundOff: 0, grandTotal: 12_500 });
  });

  it("returns zeros for an empty bill", () => {
    expect(calculateBill({ pricesIncludeTax: false, lines: [] })).toEqual({
      lines: [],
      taxBreakup: [],
      subtotal: 0,
      discountTotal: 0,
      taxableTotal: 0,
      cgstTotal: 0,
      sgstTotal: 0,
      igstTotal: 0,
      serviceCharge: 0,
      roundOff: 0,
      grandTotal: 0,
    });
  });

  it("keeps 0% (exempt) items in the breakup", () => {
    const r = calculateBill({ pricesIncludeTax: false, lines: [line("milk", 5_000, 0)] });
    expect(r.taxBreakup).toEqual([{ taxRateBps: 0, taxable: 5_000, cgst: 0, sgst: 0, igst: 0 }]);
  });

  it("rejects invalid input instead of guessing", () => {
    const bad =
      (l: Partial<BillLineInput>, extra: Partial<BillInput> = {}) =>
      () =>
        calculateBill({
          pricesIncludeTax: false,
          lines: [{ ...line("x", 1_000, 500), ...l }],
          ...extra,
        });
    expect(bad({ unitPrice: -1 })).toThrow(RangeError);
    expect(bad({ unitPrice: 10.5 })).toThrow(RangeError);
    expect(bad({ quantity: 0 })).toThrow(RangeError);
    expect(bad({ quantity: 1.5 })).toThrow(RangeError);
    expect(bad({ taxRateBps: 10_001 })).toThrow(RangeError);
    expect(bad({ discount: { kind: "PERCENT", bps: 20_000 } })).toThrow(RangeError);
    expect(bad({ discount: { kind: "AMOUNT", paise: -5 } })).toThrow(RangeError);
    expect(bad({}, { serviceChargeBps: -1 })).toThrow(RangeError);
    expect(bad({ unitPrice: Number.MAX_SAFE_INTEGER, quantity: 2 })).toThrow(RangeError);
  });
});

describe("tax helpers", () => {
  it("taxOn gives equal CGST/SGST halves", () => {
    expect(taxOn(10_001, 500, "CGST_SGST")).toEqual({ cgst: 250, sgst: 250, igst: 0 });
  });
  it("splitInclusive always reconstructs the amount", () => {
    const s = splitInclusive(99_999, 1_800, "CGST_SGST");
    expect(s.taxable + s.cgst + s.sgst).toBe(99_999);
  });
});

// Property tests: invariants that must hold for any bill.
const lineArb = fc.record({
  id: fc.uuid(),
  unitPrice: fc.integer({ min: 0, max: 5_000_000 }),
  quantity: fc.integer({ min: 1, max: 50 }),
  taxRateBps: fc.constantFrom(0, 500, 1_200, 1_800, 2_800),
  discount: fc.option(
    fc.oneof(
      fc.record({
        kind: fc.constant("PERCENT" as const),
        bps: fc.integer({ min: 0, max: 10_000 }),
      }),
      fc.record({
        kind: fc.constant("AMOUNT" as const),
        paise: fc.integer({ min: 0, max: 5_000_000 }),
      }),
    ),
    { nil: undefined },
  ),
});

const billArb: fc.Arbitrary<BillInput> = fc.record({
  pricesIncludeTax: fc.boolean(),
  taxType: fc.constantFrom("CGST_SGST" as const, "IGST" as const),
  lines: fc.array(lineArb, { maxLength: 25 }),
  billDiscount: fc.option(
    fc.oneof(
      fc.record({
        kind: fc.constant("PERCENT" as const),
        bps: fc.integer({ min: 0, max: 10_000 }),
      }),
      fc.record({
        kind: fc.constant("AMOUNT" as const),
        paise: fc.integer({ min: 0, max: 10_000_000 }),
      }),
    ),
    { nil: undefined },
  ),
  serviceChargeBps: fc.option(fc.integer({ min: 0, max: 2_000 }), { nil: undefined }),
});

describe("calculateBill — properties (random bills)", () => {
  it("always reconciles to the paisa", () => {
    fc.assert(
      fc.property(billArb, (input) => {
        const r = calculateBill(input);
        const sum = (f: (l: (typeof r.lines)[number]) => number) =>
          r.lines.reduce((s, l) => s + f(l), 0);

        expect(r.grandTotal).toBe(
          r.taxableTotal + r.cgstTotal + r.sgstTotal + r.igstTotal + r.roundOff,
        );
        expect(r.grandTotal % 100).toBe(0);
        expect(r.roundOff).toBeGreaterThanOrEqual(-49);
        expect(r.roundOff).toBeLessThanOrEqual(50);
        expect(r.subtotal - r.discountTotal).toBe(sum((l) => l.net));
        expect(r.taxableTotal).toBe(sum((l) => l.taxable + l.serviceCharge));
        expect(r.serviceCharge).toBe(sum((l) => l.serviceCharge));
        for (const l of r.lines) {
          expect(
            Math.min(l.net, l.taxable, l.serviceCharge, l.cgst, l.sgst, l.igst),
          ).toBeGreaterThanOrEqual(0);
          expect(l.cgst).toBe(l.sgst); // equal halves, always
          if (input.pricesIncludeTax && l.serviceCharge === 0) {
            expect(l.taxable + l.cgst + l.sgst + l.igst).toBe(l.net); // inclusive price is honoured
          }
        }
        const breakupTaxable = r.taxBreakup.reduce((s, b) => s + b.taxable, 0);
        expect(breakupTaxable).toBe(r.taxableTotal);
      }),
      { numRuns: 2_000 },
    );
  });

  it("is deterministic", () => {
    fc.assert(
      fc.property(billArb, (input) => {
        expect(calculateBill(input)).toEqual(calculateBill(input));
      }),
    );
  });
});
