import { describe, expect, it } from "vitest";
import { GST_RATES_BPS } from "../menu";
import {
  addOnGroupInputSchema,
  categoryUpdateSchema,
  itemInputSchema,
  itemUpdateSchema,
} from "./menu";

const item = {
  categoryId: "cat1",
  name: "Paneer Tikka",
  dietType: "VEG",
  basePrice: 22_000,
  taxRateBps: 500,
};

describe("itemInputSchema", () => {
  it.each(GST_RATES_BPS)("accepts the GST rate %i bps", (taxRateBps) => {
    expect(itemInputSchema.safeParse({ ...item, taxRateBps }).success).toBe(true);
  });

  it.each([1200, 2800, 250, -500])("rejects the GST rate %i bps", (taxRateBps) => {
    expect(itemInputSchema.safeParse({ ...item, taxRateBps }).success).toBe(false);
  });

  it("needs a positive whole-paise price", () => {
    expect(itemInputSchema.safeParse({ ...item, basePrice: 0 }).success).toBe(false);
    expect(itemInputSchema.safeParse({ ...item, basePrice: 12.5 }).success).toBe(false);
  });

  it("normalises the code and blanks, and defaults lists", () => {
    const parsed = itemInputSchema.parse({ ...item, code: " pt1 ", nameHi: " ", hsnSac: "" });
    expect(parsed).toMatchObject({
      code: "PT1",
      nameHi: null,
      hsnSac: null,
      variants: [],
      addOnGroupIds: [],
    });
    expect(itemInputSchema.safeParse({ ...item, code: "PT-1" }).success).toBe(false);
  });

  it("rejects duplicate size names", () => {
    const variants = [
      { name: "Half", price: 12_000 },
      { name: "half", price: 20_000 },
    ];
    expect(itemInputSchema.safeParse({ ...item, variants }).success).toBe(false);
  });
});

describe("update schemas", () => {
  it("leave omitted fields out instead of resetting them to defaults", () => {
    expect(itemUpdateSchema.parse({ isActive: false })).toEqual({ isActive: false });
    expect(categoryUpdateSchema.parse({ name: "Mains" })).toEqual({ name: "Mains" });
  });
});

describe("addOnGroupInputSchema", () => {
  const addOns = [
    { name: "Extra cheese", price: 3_000 },
    { name: "Extra butter", price: 2_000 },
  ];
  it("accepts a sensible group", () => {
    expect(
      addOnGroupInputSchema.safeParse({ name: "Extras", minSelect: 0, maxSelect: 2, addOns })
        .success,
    ).toBe(true);
  });
  it("needs at least ≤ at most ≤ number of add-ons", () => {
    expect(
      addOnGroupInputSchema.safeParse({ name: "Extras", minSelect: 2, maxSelect: 1, addOns })
        .success,
    ).toBe(false);
    expect(
      addOnGroupInputSchema.safeParse({ name: "Extras", minSelect: 0, maxSelect: 3, addOns })
        .success,
    ).toBe(false);
  });
});
