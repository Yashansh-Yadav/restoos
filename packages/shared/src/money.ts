// Money primitives (CLAUDE.md rule 1): amounts are integer paise, rates are integer basis points.
// No floats anywhere in calculations — rounding is done in integer (BigInt) arithmetic.
// Browser-safe: used by the API, the web cart and offline billing.

/** Throws unless `value` is a non-negative safe integer (a valid paise amount). */
export function assertPaise(value: number, label = "amount"): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer number of paise (got ${value})`);
  }
}

/** Throws unless `bps` is an integer between 0 and 10000 (0%–100%). */
export function assertBps(bps: number, label = "rate"): void {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new RangeError(`${label} must be integer basis points between 0 and 10000 (got ${bps})`);
  }
}

/** `round(a × b / c)` with half-up rounding, exact for any safe non-negative integers. */
export function mulDivRound(a: number, b: number, c: number): number {
  if (c <= 0) throw new RangeError("divisor must be positive");
  const result = (BigInt(a) * BigInt(b) * 2n + BigInt(c)) / (2n * BigInt(c));
  return Number(result);
}

/**
 * Splits `total` across `items` in proportion to `weightOf(item)` (largest-remainder method).
 * Shares always sum to exactly `total`; ties go to the earlier item, so it is deterministic.
 */
export function allocateBy<T>(
  total: number,
  items: readonly T[],
  weightOf: (item: T) => number,
): { item: T; share: number }[] {
  assertPaise(total, "total");
  const rows = items.map((item, i) => {
    const weight = weightOf(item);
    assertPaise(weight, `weight[${i}]`);
    return { item, i, w: BigInt(weight), part: 0n, rem: 0n };
  });
  const sum = rows.reduce((s, r) => s + r.w, 0n);
  if (sum === 0n) {
    if (total === 0) return rows.map((r) => ({ item: r.item, share: 0 }));
    throw new RangeError("cannot allocate a non-zero total across zero weights");
  }

  const T = BigInt(total);
  for (const r of rows) {
    r.part = (T * r.w) / sum;
    r.rem = (T * r.w) % sum;
  }
  let left = T - rows.reduce((s, r) => s + r.part, 0n);
  const byRemainder = [...rows].sort((x, y) =>
    x.rem === y.rem ? x.i - y.i : x.rem > y.rem ? -1 : 1,
  );
  for (const r of byRemainder) {
    if (left === 0n) break;
    r.part += 1n;
    left -= 1n;
  }
  return rows.map((r) => ({ item: r.item, share: Number(r.part) }));
}

/** `allocateBy` for a plain list of weights. */
export function allocate(total: number, weights: readonly number[]): number[] {
  return allocateBy(total, weights, (w) => w).map((x) => x.share);
}

/** Indian digit grouping: 1234567 → "12,34,567". */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

export type FormatINROptions = {
  /** "always" (default): ₹280.00 — bills. "auto": ₹280 when there are no paise — menus. */
  paise?: "always" | "auto";
};

/** Formats paise as Indian rupees: 12345678 → "₹1,23,456.78". Negative → "−₹…". */
export function formatINR(paise: number, options: FormatINROptions = {}): string {
  if (!Number.isSafeInteger(paise)) throw new RangeError(`not an integer paise amount: ${paise}`);
  const sign = paise < 0 ? "−" : "";
  const abs = Math.abs(paise);
  const fraction = abs % 100;
  const rupees = groupIndian(String((abs - fraction) / 100));
  const showPaise = options.paise !== "auto" || fraction !== 0;
  return `${sign}₹${rupees}${showPaise ? `.${String(fraction).padStart(2, "0")}` : ""}`;
}

/**
 * Parses a rupee string typed by a person into paise without floats:
 * "280" → 28000, "1,23,456.7" → 12345670, "₹ 99.99" → 9999. Throws on anything else.
 */
export function parseRupees(input: string): number {
  const cleaned = input.trim().replace(/^₹\s*/, "").replaceAll(",", "");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) throw new RangeError(`not a rupee amount: "${input}"`);
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const paise = Number(match[1]) * 100 + Number(fraction);
  assertPaise(paise);
  return paise;
}
