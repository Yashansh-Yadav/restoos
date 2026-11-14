import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { allocate, assertBps, assertPaise, formatINR, mulDivRound, parseRupees } from "./money";

describe("formatINR", () => {
  it("uses Indian digit grouping and always shows paise by default", () => {
    expect(formatINR(0)).toBe("₹0.00");
    expect(formatINR(5)).toBe("₹0.05");
    expect(formatINR(28_000)).toBe("₹280.00");
    expect(formatINR(100_000)).toBe("₹1,000.00");
    expect(formatINR(12_345_678)).toBe("₹1,23,456.78");
    expect(formatINR(1_234_567_890)).toBe("₹1,23,45,678.90");
  });

  it("can hide zero paise for menu prices", () => {
    expect(formatINR(28_000, { paise: "auto" })).toBe("₹280");
    expect(formatINR(28_050, { paise: "auto" })).toBe("₹280.50");
  });

  it("formats negatives (e.g. round-off) with a minus sign", () => {
    expect(formatINR(-20)).toBe("−₹0.20");
    expect(formatINR(-150_000)).toBe("−₹1,500.00");
  });

  it("rejects non-integer amounts", () => {
    expect(() => formatINR(10.5)).toThrow(RangeError);
  });
});

describe("parseRupees", () => {
  it("parses what people type into paise without floats", () => {
    expect(parseRupees("280")).toBe(28_000);
    expect(parseRupees("280.5")).toBe(28_050);
    expect(parseRupees("0.07")).toBe(7);
    expect(parseRupees(" ₹ 1,23,456.78 ")).toBe(12_345_678);
    expect(parseRupees("0.1")).toBe(10); // the classic float trap
  });

  it("rejects anything that isn't a plain rupee amount", () => {
    for (const bad of ["", "-5", "1.234", "abc", "1e3", "₹", "12.", ".5"]) {
      expect(() => parseRupees(bad), bad).toThrow(RangeError);
    }
  });

  it("round-trips with formatINR", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1e12 }), (p) => {
        expect(parseRupees(formatINR(p))).toBe(p);
      }),
    );
  });
});

describe("mulDivRound", () => {
  it("rounds half up", () => {
    expect(mulDivRound(5, 1, 10)).toBe(1); // 0.5 → 1
    expect(mulDivRound(4, 1, 10)).toBe(0); // 0.4 → 0
    expect(mulDivRound(28_000, 500, 20_000)).toBe(700);
  });
  it("stays exact for large values", () => {
    expect(mulDivRound(9_007_199_254_740_991, 10_000, 10_000)).toBe(9_007_199_254_740_991);
  });
  it("rejects a zero divisor", () => {
    expect(() => mulDivRound(1, 1, 0)).toThrow(RangeError);
  });
});

describe("allocate", () => {
  it("splits proportionally and always sums exactly", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(4_000, [30_000, 10_000])).toEqual([3_000, 1_000]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    expect(allocate(0, [0, 0])).toEqual([0, 0]);
  });

  it("refuses to allocate money across zero weights", () => {
    expect(() => allocate(1, [0, 0])).toThrow(RangeError);
  });

  it("is exact and gives zero-weight items nothing", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1e9 }),
        fc.array(fc.integer({ min: 0, max: 1e7 }), { minLength: 1, maxLength: 30 }),
        (total, weights) => {
          fc.pre(weights.some((w) => w > 0));
          const parts = allocate(total, weights);
          expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
          parts.forEach((p, i) => {
            expect(p).toBeGreaterThanOrEqual(0);
            if (weights[i] === 0) expect(p).toBe(0);
          });
        },
      ),
    );
  });
});

describe("asserts", () => {
  it("validate paise and basis points", () => {
    expect(() => assertPaise(1)).not.toThrow();
    expect(() => assertPaise(-1)).toThrow(RangeError);
    expect(() => assertPaise(0.5)).toThrow(RangeError);
    expect(() => assertBps(10_000)).not.toThrow();
    expect(() => assertBps(10_001)).toThrow(RangeError);
    expect(() => assertBps(1.5)).toThrow(RangeError);
  });
});
