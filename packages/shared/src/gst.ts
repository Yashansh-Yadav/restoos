// GST bill calculation (plan §5.1, CLAUDE.md rule 1). Pure, deterministic, integer-only.
// The one place where bill totals are computed — the API (M7), the web cart (M5) and offline
// billing (M9) all call calculateBill().
//
// Order per line:
//   gross → item discount → share of bill discount (proportional) → net
//   → taxable value (inclusive prices are backed out so taxable + tax == net exactly)
//   → share of the optional service charge (proportional to taxable value)
//   → GST on taxable + service-charge share, at the line's rate
//     (intra-state: CGST = SGST = rate/2, always equal; inter-state: IGST)
// Then totals → round-off to the nearest rupee as its own line.
//
// Decision 2026-11-14: GST is charged on the service charge (common practice; CA to confirm).

import { allocateBy, assertBps, assertPaise, mulDivRound } from "./money";

export type Discount = { kind: "PERCENT"; bps: number } | { kind: "AMOUNT"; paise: number };

export type TaxType = "CGST_SGST" | "IGST";

export type BillLineInput = {
  id: string;
  /** Price of one unit in paise (incl. add-ons). Tax-inclusive when `pricesIncludeTax`. */
  unitPrice: number;
  quantity: number;
  taxRateBps: number;
  discount?: Discount;
};

export type BillInput = {
  pricesIncludeTax: boolean;
  /** Intra-state dine-in is CGST + SGST (default); IGST supported for completeness. */
  taxType?: TaxType;
  lines: readonly BillLineInput[];
  billDiscount?: Discount;
  /** Optional, off by default, removable per bill (plan §5.1). 0 or undefined = no charge. */
  serviceChargeBps?: number;
};

export type BillLineResult = {
  id: string;
  taxRateBps: number;
  quantity: number;
  unitPrice: number;
  gross: number;
  itemDiscount: number;
  billDiscount: number;
  /** gross − discounts (tax-inclusive when prices include tax). */
  net: number;
  taxable: number;
  serviceCharge: number;
  cgst: number;
  sgst: number;
  igst: number;
  /** taxable + serviceCharge + taxes */
  total: number;
};

export type TaxBreakupRow = {
  taxRateBps: number;
  /** Taxable value at this rate, including the service-charge share. */
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
};

export type BillCalculation = {
  lines: BillLineResult[];
  taxBreakup: TaxBreakupRow[];
  /** Σ gross */
  subtotal: number;
  /** item + bill discounts */
  discountTotal: number;
  /** Food taxable value + service charge (all of it is taxable). */
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  serviceCharge: number;
  /** grandTotal − (taxableTotal + taxes); between −49 and +50 paise. */
  roundOff: number;
  grandTotal: number;
};

const BPS = 10_000;

function discountAmount(base: number, discount: Discount | undefined, label: string): number {
  if (!discount) return 0;
  if (discount.kind === "PERCENT") {
    assertBps(discount.bps, `${label} percent`);
    return mulDivRound(base, discount.bps, BPS);
  }
  assertPaise(discount.paise, `${label} amount`);
  return Math.min(discount.paise, base);
}

type Tax = { cgst: number; sgst: number; igst: number };

/** GST on a tax-exclusive amount. CGST and SGST are each rounded on rate/2, so they're equal. */
export function taxOn(amount: number, rateBps: number, taxType: TaxType): Tax {
  if (taxType === "IGST") return { cgst: 0, sgst: 0, igst: mulDivRound(amount, rateBps, BPS) };
  const half = mulDivRound(amount, rateBps, 2 * BPS);
  return { cgst: half, sgst: half, igst: 0 };
}

/** Splits a tax-inclusive amount into taxable value + tax with `taxable + tax == amount`. */
export function splitInclusive(
  amount: number,
  rateBps: number,
  taxType: TaxType,
): Tax & { taxable: number } {
  const estimate = mulDivRound(amount, BPS, BPS + rateBps);
  if (taxType === "IGST") return { taxable: estimate, cgst: 0, sgst: 0, igst: amount - estimate };
  const half = mulDivRound(estimate, rateBps, 2 * BPS);
  return { taxable: amount - 2 * half, cgst: half, sgst: half, igst: 0 };
}

function validate(input: BillInput): void {
  input.lines.forEach((l, i) => {
    assertPaise(l.unitPrice, `lines[${i}].unitPrice`);
    if (!Number.isSafeInteger(l.quantity) || l.quantity < 1) {
      throw new RangeError(`lines[${i}].quantity must be a positive integer (got ${l.quantity})`);
    }
    assertBps(l.taxRateBps, `lines[${i}].taxRateBps`);
  });
  if (input.serviceChargeBps !== undefined) assertBps(input.serviceChargeBps, "serviceChargeBps");
}

export function calculateBill(input: BillInput): BillCalculation {
  validate(input);
  const taxType: TaxType = input.taxType ?? "CGST_SGST";

  // 1–2. gross and item discounts
  const pre = input.lines.map((l, i) => {
    const gross = l.unitPrice * l.quantity;
    assertPaise(gross, `lines[${i}] gross`);
    const itemDiscount = discountAmount(gross, l.discount, `lines[${i}] discount`);
    return { line: l, gross, itemDiscount, afterItem: gross - itemDiscount };
  });

  // 3. bill discount, spread proportionally over what is left after item discounts
  const afterItemTotal = pre.reduce((s, p) => s + p.afterItem, 0);
  const billDiscountTotal = discountAmount(afterItemTotal, input.billDiscount, "bill discount");
  const withBillShare = allocateBy(billDiscountTotal, pre, (p) => p.afterItem);

  // 4–5. net and taxable value
  const taxed = withBillShare.map(({ item: p, share: billDiscount }) => {
    const net = p.afterItem - billDiscount;
    const base = input.pricesIncludeTax
      ? splitInclusive(net, p.line.taxRateBps, taxType)
      : { taxable: net, ...taxOn(net, p.line.taxRateBps, taxType) };
    return { ...p, billDiscount, net, ...base };
  });

  // 6. optional service charge on the taxable value, spread by taxable value
  const foodTaxable = taxed.reduce((s, t) => s + t.taxable, 0);
  const serviceCharge = input.serviceChargeBps
    ? mulDivRound(foodTaxable, input.serviceChargeBps, BPS)
    : 0;
  const withScShare = allocateBy(serviceCharge, taxed, (t) => t.taxable);

  // 7. GST on the service-charge share at the line's rate
  const lines: BillLineResult[] = withScShare.map(({ item: t, share: sc }) => {
    const scTax = taxOn(sc, t.line.taxRateBps, taxType);
    const cgst = t.cgst + scTax.cgst;
    const sgst = t.sgst + scTax.sgst;
    const igst = t.igst + scTax.igst;
    return {
      id: t.line.id,
      taxRateBps: t.line.taxRateBps,
      quantity: t.line.quantity,
      unitPrice: t.line.unitPrice,
      gross: t.gross,
      itemDiscount: t.itemDiscount,
      billDiscount: t.billDiscount,
      net: t.net,
      taxable: t.taxable,
      serviceCharge: sc,
      cgst,
      sgst,
      igst,
      total: t.taxable + sc + cgst + sgst + igst,
    };
  });

  // 8. totals, per-rate breakup, round-off
  const sum = (pick: (l: BillLineResult) => number) => lines.reduce((s, l) => s + pick(l), 0);
  const cgstTotal = sum((l) => l.cgst);
  const sgstTotal = sum((l) => l.sgst);
  const igstTotal = sum((l) => l.igst);
  const taxableTotal = foodTaxable + serviceCharge;
  const preRound = taxableTotal + cgstTotal + sgstTotal + igstTotal;
  const grandTotal = Math.floor((preRound + 50) / 100) * 100;

  const byRate = new Map<number, TaxBreakupRow>();
  for (const l of lines) {
    const row = byRate.get(l.taxRateBps) ?? {
      taxRateBps: l.taxRateBps,
      taxable: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
    };
    row.taxable += l.taxable + l.serviceCharge;
    row.cgst += l.cgst;
    row.sgst += l.sgst;
    row.igst += l.igst;
    byRate.set(l.taxRateBps, row);
  }
  const taxBreakup = [...byRate.values()]
    .filter((r) => r.taxable + r.cgst + r.sgst + r.igst > 0)
    .sort((a, b) => a.taxRateBps - b.taxRateBps);

  return {
    lines,
    taxBreakup,
    subtotal: sum((l) => l.gross),
    discountTotal: sum((l) => l.itemDiscount + l.billDiscount),
    taxableTotal,
    cgstTotal,
    sgstTotal,
    igstTotal,
    serviceCharge,
    roundOff: grandTotal - preRound,
    grandTotal,
  };
}
