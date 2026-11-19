import type { PublicMenu } from "@restoos/shared";
import { describe, expect, it } from "vitest";
import { addToCart, cartSummary, countOf, setQuantity, type CartLine } from "./cart";

const menu: PublicMenu["menu"] = {
  categories: [
    {
      id: "c",
      name: "Mains",
      nameHi: null,
      items: [
        {
          id: "dal",
          name: "Dal",
          nameHi: null,
          description: null,
          dietType: "VEG",
          price: 25_000,
          variants: [],
          addOnGroupIds: ["extras"],
          imageUrl: null,
          inStock: true,
        },
        {
          id: "paneer",
          name: "Paneer Tikka",
          nameHi: null,
          description: null,
          dietType: "VEG",
          price: 14_000,
          variants: [
            { id: "half", name: "Half", price: 14_000 },
            { id: "full", name: "Full", price: 22_000 },
          ],
          addOnGroupIds: [],
          imageUrl: null,
          inStock: true,
        },
        {
          id: "soup",
          name: "Soup",
          nameHi: null,
          description: null,
          dietType: "VEG",
          price: 9_000,
          variants: [],
          addOnGroupIds: [],
          imageUrl: null,
          inStock: false,
        },
      ],
    },
  ],
  addOnGroups: [
    {
      id: "extras",
      name: "Extras",
      minSelect: 0,
      maxSelect: 2,
      addOns: [{ id: "butter", name: "Butter", price: 2_000 }],
    },
  ] as PublicMenu["menu"]["addOnGroups"],
};

describe("guest cart (M5-T6b)", () => {
  it("merges the same choice and keeps different sizes/add-ons apart", () => {
    let lines: CartLine[] = [];
    lines = addToCart(lines, { itemId: "dal", variantId: null, addOnIds: [], quantity: 1 }, "a");
    lines = addToCart(lines, { itemId: "dal", variantId: null, addOnIds: [], quantity: 2 }, "b");
    lines = addToCart(
      lines,
      { itemId: "dal", variantId: null, addOnIds: ["butter"], quantity: 1 },
      "c",
    );
    lines = addToCart(
      lines,
      { itemId: "paneer", variantId: "full", addOnIds: [], quantity: 1 },
      "d",
    );
    expect(lines.map((l) => [l.key, l.quantity])).toEqual([
      ["a", 3],
      ["c", 1],
      ["d", 1],
    ]);
    expect(countOf(lines, "dal")).toBe(4);

    // 3 × 250 + 1 × (250 + 20) + 1 × 220 = ₹1,240
    expect(cartSummary(lines, menu)).toMatchObject({ count: 5, subtotal: 124_000 });

    lines = setQuantity(lines, "a", 0);
    expect(lines.map((l) => l.key)).toEqual(["c", "d"]);
    lines = setQuantity(lines, "c", 500);
    expect(lines.find((l) => l.key === "c")?.quantity).toBe(99);
  });

  it("leaves out dishes that ran out (and reports them)", () => {
    const lines: CartLine[] = [
      { key: "x", itemId: "soup", variantId: null, addOnIds: [], quantity: 2 },
      { key: "y", itemId: "dal", variantId: null, addOnIds: [], quantity: 1 },
      { key: "z", itemId: "gone", variantId: null, addOnIds: [], quantity: 1 },
    ];
    const s = cartSummary(lines, menu);
    expect(s).toMatchObject({ count: 1, subtotal: 25_000 });
    expect(s.unavailable.map((l) => l.key)).toEqual(["x", "z"]);
  });
});
