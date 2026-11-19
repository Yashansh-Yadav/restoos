import { unitPriceOf, type PublicMenu } from "@restoos/shared";

// The guest's cart on the QR menu (M5-T6b). Pure functions (unit-tested) + sessionStorage per
// table token, so a refresh keeps it but the next guest on another phone starts empty. Prices
// here are a preview in paise — the API re-prices every line when the order is placed.

export type CartLine = {
  key: string;
  itemId: string;
  variantId: string | null;
  addOnIds: string[];
  quantity: number;
};
export type Draft = Omit<CartLine, "key">;

type Menu = PublicMenu["menu"];
type Item = Menu["categories"][number]["items"][number];

export const MAX_LINES = 30;
export const MAX_QTY = 99;

const sameChoice = (a: Draft, b: Draft) =>
  a.itemId === b.itemId &&
  a.variantId === b.variantId &&
  [...a.addOnIds].sort().join() === [...b.addOnIds].sort().join();

/** Adds a choice (merging with the same item + size + add-ons). */
export function addToCart(lines: readonly CartLine[], draft: Draft, key: string): CartLine[] {
  const same = lines.find((l) => sameChoice(l, draft));
  if (same) {
    return lines.map((l) =>
      l === same ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + draft.quantity) } : l,
    );
  }
  if (lines.length >= MAX_LINES) return [...lines];
  return [...lines, { ...draft, key }];
}

/** Sets a line's quantity; 0 removes it. */
export function setQuantity(lines: readonly CartLine[], key: string, quantity: number) {
  return quantity <= 0
    ? lines.filter((l) => l.key !== key)
    : lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(MAX_QTY, quantity) } : l));
}

/** How many of this dish (any size/add-ons) are in the cart. */
export const countOf = (lines: readonly CartLine[], itemId: string) =>
  lines.filter((l) => l.itemId === itemId).reduce((n, l) => n + l.quantity, 0);

export function itemIndex(menu: Menu): Map<string, Item> {
  return new Map(menu.categories.flatMap((c) => c.items.map((i) => [i.id, i] as const)));
}

/** One unit's price for a choice (size or base, plus add-ons). */
export const unitPrice = (item: Item, menu: Menu, line: Draft) =>
  unitPriceOf({ basePrice: item.price, variants: item.variants }, menu.addOnGroups, line);

/** Drops lines whose dish left the menu or ran out; totals in paise. */
export function cartSummary(lines: readonly CartLine[], menu: Menu) {
  const items = itemIndex(menu);
  const usable = lines.filter((l) => items.get(l.itemId)?.inStock);
  const subtotal = usable.reduce((sum, l) => {
    const item = items.get(l.itemId);
    return item ? sum + unitPrice(item, menu, l) * l.quantity : sum;
  }, 0);
  return {
    count: usable.reduce((n, l) => n + l.quantity, 0),
    subtotal,
    unavailable: lines.filter((l) => !items.get(l.itemId)?.inStock),
  };
}

// ── Persistence (best effort: private mode / blocked storage just means no memory) ──

const storageKey = (token: string) => `restoos:cart:${token}`;

export function loadCart(token: string): CartLine[] {
  try {
    const raw = window.sessionStorage.getItem(storageKey(token));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (l): l is CartLine =>
            typeof l === "object" &&
            l !== null &&
            typeof (l as CartLine).key === "string" &&
            typeof (l as CartLine).itemId === "string" &&
            Number.isInteger((l as CartLine).quantity) &&
            Array.isArray((l as CartLine).addOnIds),
        )
      : [];
  } catch {
    return [];
  }
}

export function saveCart(token: string, lines: readonly CartLine[]) {
  try {
    if (lines.length === 0) window.sessionStorage.removeItem(storageKey(token));
    else window.sessionStorage.setItem(storageKey(token), JSON.stringify(lines));
  } catch {
    // storage unavailable: the cart still works for this page view
  }
}
