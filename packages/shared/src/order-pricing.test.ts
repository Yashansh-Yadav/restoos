import { describe, expect, it } from "vitest";
import { lineName, needsOptions, orderTotals, selectionError, unitPriceOf } from "./order-pricing";
import type { PadAddOnGroup, PadItem } from "./schemas/orders";

const groups: PadAddOnGroup[] = [
  {
    id: "g-extras",
    name: "Extras",
    minSelect: 0,
    maxSelect: 2,
    addOns: [
      { id: "a-cheese", name: "Cheese", price: 3_000 },
      { id: "a-butter", name: "Butter", price: 2_000 },
      { id: "a-mayo", name: "Mayo", price: 1_000 },
    ],
  },
  {
    id: "g-bread",
    name: "Bread",
    minSelect: 1,
    maxSelect: 1,
    addOns: [
      { id: "a-naan", name: "Naan", price: 0 },
      { id: "a-roti", name: "Roti", price: 0 },
    ],
  },
];

const item = (over: Partial<PadItem> = {}): PadItem => ({
  id: "i1",
  code: "12",
  name: "Paneer Tikka",
  dietType: "VEG",
  basePrice: 20_000,
  taxRateBps: 500,
  inStock: true,
  variants: [],
  addOnGroupIds: [],
  ...over,
});
const sized = item({
  variants: [
    { id: "v-half", name: "Half", price: 14_000 },
    { id: "v-full", name: "Full", price: 24_000 },
  ],
  addOnGroupIds: ["g-extras"],
});

describe("order pricing (M5-T1)", () => {
  it("prices a unit from the size and add-ons", () => {
    expect(unitPriceOf(item(), groups, { addOnIds: [] })).toBe(20_000);
    expect(unitPriceOf(sized, groups, { variantId: "v-full", addOnIds: ["a-cheese"] })).toBe(
      27_000,
    );
    expect(lineName(sized, "v-half")).toBe("Paneer Tikka (Half)");
    expect(lineName(item())).toBe("Paneer Tikka");
  });

  it("knows when a tap needs the options sheet", () => {
    expect(needsOptions(item(), groups)).toBe(false);
    expect(needsOptions(item({ addOnGroupIds: ["g-extras"] }), groups)).toBe(false);
    expect(needsOptions(sized, groups)).toBe(true);
    expect(needsOptions(item({ addOnGroupIds: ["g-bread"] }), groups)).toBe(true);
  });

  it("checks sizes and add-on limits", () => {
    expect(selectionError(sized, groups, { addOnIds: [] })).toBe("Choose a size for Paneer Tikka");
    expect(selectionError(sized, groups, { variantId: "nope", addOnIds: [] })).toMatch(/size/);
    expect(selectionError(item(), groups, { variantId: "v-full", addOnIds: [] })).toBe(
      "Paneer Tikka has no sizes",
    );
    expect(
      selectionError(sized, groups, {
        variantId: "v-full",
        addOnIds: ["a-cheese", "a-butter", "a-mayo"],
      }),
    ).toBe("Choose at most 2 from Extras");
    expect(selectionError(sized, groups, { variantId: "v-full", addOnIds: ["a-naan"] })).toMatch(
      /isn't available/,
    );
    const bread = item({ addOnGroupIds: ["g-bread"] });
    expect(selectionError(bread, groups, { addOnIds: [] })).toBe("Choose at least 1 from Bread");
    expect(selectionError(bread, groups, { addOnIds: ["a-roti"] })).toBeNull();
    expect(
      selectionError(sized, groups, { variantId: "v-full", addOnIds: ["a-cheese"] }),
    ).toBeNull();
  });

  it("totals with GST on top, or inside the price", () => {
    const lines = [
      { unitPrice: 20_000, quantity: 2, taxRateBps: 500 },
      { unitPrice: 6_000, quantity: 1, taxRateBps: 1_800 },
    ];
    // ₹400 @5% = ₹20, ₹60 @18% = ₹10.80 → ₹490.80 → rounds to ₹491.
    expect(orderTotals(lines, { pricesIncludeTax: false })).toEqual({
      subtotal: 46_000,
      tax: 3_080,
      total: 49_100,
      count: 3,
    });
    const incl = orderTotals(lines, { pricesIncludeTax: true });
    expect(incl.total).toBe(46_000);
    expect(incl.tax).toBeGreaterThan(0);
    expect(orderTotals([], { pricesIncludeTax: false })).toEqual({
      subtotal: 0,
      tax: 0,
      total: 0,
      count: 0,
    });
  });
});
