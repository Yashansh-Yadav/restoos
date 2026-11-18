import { calculateBill } from "./gst";
import type { PadAddOnGroup, PadItem } from "./schemas/orders";

// Order pricing + option rules (M5-T1). Shared by the API (which re-prices every send from the
// database and never trusts the client) and the order screen (live running total), so the two
// always agree. Money in paise, tax via calculateBill (gst.ts) — the same maths as the bill.

export type Selection = { variantId?: string | null | undefined; addOnIds: readonly string[] };

/** Why this size/add-on choice isn't valid for the item, or null when it is. */
export function selectionError(
  item: Pick<PadItem, "name" | "variants" | "addOnGroupIds">,
  groups: readonly PadAddOnGroup[],
  sel: Selection,
): string | null {
  if (item.variants.length > 0) {
    if (!sel.variantId) return `Choose a size for ${item.name}`;
    if (!item.variants.some((v) => v.id === sel.variantId)) {
      return `That size isn't on the menu for ${item.name}`;
    }
  } else if (sel.variantId) {
    return `${item.name} has no sizes`;
  }
  if (new Set(sel.addOnIds).size !== sel.addOnIds.length) return "An add-on is listed twice";
  const mine = groups.filter((g) => item.addOnGroupIds.includes(g.id));
  const known = new Set(mine.flatMap((g) => g.addOns.map((a) => a.id)));
  if (sel.addOnIds.some((id) => !known.has(id))) {
    return `That add-on isn't available for ${item.name}`;
  }
  for (const g of mine) {
    const n = g.addOns.filter((a) => sel.addOnIds.includes(a.id)).length;
    if (n < g.minSelect) return `Choose at least ${g.minSelect} from ${g.name}`;
    if (n > g.maxSelect) return `Choose at most ${g.maxSelect} from ${g.name}`;
  }
  return null;
}

/** True when tapping the item can't simply add one: it needs a size or a required add-on. */
export function needsOptions(
  item: Pick<PadItem, "variants" | "addOnGroupIds">,
  groups: readonly PadAddOnGroup[],
): boolean {
  return (
    item.variants.length > 0 ||
    groups.some((g) => item.addOnGroupIds.includes(g.id) && g.minSelect > 0)
  );
}

/** Price of one unit: the size's price (or base price) plus the chosen add-ons. */
export function unitPriceOf(
  item: Pick<PadItem, "basePrice" | "variants">,
  groups: readonly PadAddOnGroup[],
  sel: Selection,
): number {
  const base = item.variants.find((v) => v.id === sel.variantId)?.price ?? item.basePrice;
  const addOns = groups
    .flatMap((g) => g.addOns)
    .filter((a) => sel.addOnIds.includes(a.id))
    .reduce((sum, a) => sum + a.price, 0);
  return base + addOns;
}

/** Display name snapshot: "Paneer Tikka (Full)". */
export function lineName(item: Pick<PadItem, "name" | "variants">, variantId?: string | null) {
  const size = item.variants.find((v) => v.id === variantId);
  return size ? `${item.name} (${size.name})` : item.name;
}

export type PricedLine = { unitPrice: number; quantity: number; taxRateBps: number };

/** Running total for the order screen: items, GST and total (rounded like the bill). */
export function orderTotals(
  lines: readonly PricedLine[],
  pricing: { pricesIncludeTax: boolean },
): { subtotal: number; tax: number; total: number; count: number } {
  if (lines.length === 0) return { subtotal: 0, tax: 0, total: 0, count: 0 };
  const bill = calculateBill({
    pricesIncludeTax: pricing.pricesIncludeTax,
    lines: lines.map((l, i) => ({ id: String(i), ...l })),
  });
  return {
    subtotal: bill.subtotal,
    tax: bill.cgstTotal + bill.sgstTotal + bill.igstTotal,
    total: bill.grandTotal,
    count: lines.reduce((n, l) => n + l.quantity, 0),
  };
}
