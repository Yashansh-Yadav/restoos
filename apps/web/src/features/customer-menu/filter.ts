import type { PublicMenu } from "@restoos/shared";

// Customer menu filtering (M5-T6a), pure so it's unit-tested: "Veg Only" keeps VEG dishes (egg
// is not veg in India), search matches the English or Hindi name or the description, and
// categories left empty are hidden. Out-of-stock dishes stay (greyed out, DESIGN.md §5).

export type MenuCategory = PublicMenu["menu"]["categories"][number];
export type MenuItem = MenuCategory["items"][number];

const norm = (s: string) => s.normalize("NFC").toLocaleLowerCase("en-IN").trim();

export function filterMenu(
  categories: readonly MenuCategory[],
  { vegOnly, query }: { vegOnly: boolean; query: string },
): MenuCategory[] {
  const q = norm(query);
  const matches = (i: MenuItem) =>
    (!vegOnly || i.dietType === "VEG") &&
    (q === "" ||
      norm(i.name).includes(q) ||
      (i.nameHi !== null && norm(i.nameHi).includes(q)) ||
      (i.description !== null && norm(i.description).includes(q)));
  return categories
    .map((c) => ({ ...c, items: c.items.filter(matches) }))
    .filter((c) => c.items.length > 0);
}

/** The name to show: Hindi when chosen and the owner added one, else English. */
export const displayName = (
  thing: { name: string; nameHi: string | null },
  locale: string,
): string => (locale === "hi" && thing.nameHi ? thing.nameHi : thing.name);
