import { describe, expect, it } from "vitest";
import { displayName, filterMenu, type MenuCategory, type MenuItem } from "./filter";

const item = (over: Partial<MenuItem>): MenuItem => ({
  id: over.name ?? "x",
  name: "Dish",
  nameHi: null,
  description: null,
  dietType: "VEG",
  price: 10_000,
  variants: [],
  addOnGroupIds: [],
  imageUrl: null,
  inStock: true,
  ...over,
});

const menu: MenuCategory[] = [
  {
    id: "starters",
    name: "Starters",
    nameHi: "स्टार्टर",
    items: [
      item({ name: "Paneer Tikka", nameHi: "पनीर टिक्का", description: "Smoky cottage cheese" }),
      item({ name: "Chicken 65", dietType: "NON_VEG", inStock: false }),
    ],
  },
  {
    id: "mains",
    name: "Mains",
    nameHi: null,
    items: [
      item({ name: "Butter Chicken", nameHi: "बटर चिकन", dietType: "NON_VEG" }),
      item({ name: "Egg Curry", dietType: "EGG" }),
    ],
  },
];

const names = (cats: MenuCategory[]) => cats.map((c) => [c.id, c.items.map((i) => i.name)]);

describe("filterMenu (M5-T6a)", () => {
  it("keeps everything (out of stock too) when there is no filter", () => {
    expect(names(filterMenu(menu, { vegOnly: false, query: "" }))).toEqual([
      ["starters", ["Paneer Tikka", "Chicken 65"]],
      ["mains", ["Butter Chicken", "Egg Curry"]],
    ]);
  });

  it("Veg Only drops non-veg and egg, and hides categories left empty", () => {
    expect(names(filterMenu(menu, { vegOnly: true, query: "" }))).toEqual([
      ["starters", ["Paneer Tikka"]],
    ]);
  });

  it("searches English and Hindi names and the description, ignoring case", () => {
    expect(names(filterMenu(menu, { vegOnly: false, query: "  CHICKEN " }))).toEqual([
      ["starters", ["Chicken 65"]],
      ["mains", ["Butter Chicken"]],
    ]);
    expect(names(filterMenu(menu, { vegOnly: false, query: "बटर" }))).toEqual([
      ["mains", ["Butter Chicken"]],
    ]);
    expect(names(filterMenu(menu, { vegOnly: false, query: "cottage" }))).toEqual([
      ["starters", ["Paneer Tikka"]],
    ]);
    expect(filterMenu(menu, { vegOnly: true, query: "chicken" })).toEqual([]);
  });

  it("shows the Hindi name only when chosen and present", () => {
    expect(displayName({ name: "Mains", nameHi: null }, "hi")).toBe("Mains");
    expect(displayName({ name: "Starters", nameHi: "स्टार्टर" }, "hi")).toBe("स्टार्टर");
    expect(displayName({ name: "Starters", nameHi: "स्टार्टर" }, "en")).toBe("Starters");
  });
});
