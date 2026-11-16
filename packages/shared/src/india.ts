// India-specific identifiers used across billing and onboarding (browser-safe).

/** GST state/UT codes (the first two digits of every GSTIN). 25 was merged into 26; 28 is unused. */
export const GST_STATES = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" },
] as const;

export type GstStateCode = (typeof GST_STATES)[number]["code"];
export const GST_STATE_CODES = GST_STATES.map((s) => s.code) as [GstStateCode, ...GstStateCode[]];

export function gstStateName(code: string): string | undefined {
  return GST_STATES.find((s) => s.code === code)?.name;
}

// GSTIN: 2-digit state + 10-char PAN + entity number + "Z" + check character.
export const GSTIN_FORMAT = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** The GSTIN check character for the first 14 characters (GSTN's base-36 mod algorithm). */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = GSTIN_CHARS.indexOf(first14.charAt(i));
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS.charAt((36 - (sum % 36)) % 36);
}

/** Format + checksum. Catches almost every single-character typo. */
export function isValidGstin(gstin: string): boolean {
  return GSTIN_FORMAT.test(gstin) && gstinCheckChar(gstin.slice(0, 14)) === gstin.charAt(14);
}

/** FSSAI food business licence/registration number: 14 digits. */
export const FSSAI_FORMAT = /^\d{14}$/;

// Invoice numbers (decision 2026-11-16): `{outlet 2}-{FY 4}-{device 2}{seq 6}`, e.g.
// "A1-2627-D1000045" — exactly 16 characters, the GST maximum. ≤ 999,999 bills per device per FY.
export const OUTLET_INVOICE_CODE = /^[A-Z0-9]{2}$/;
export const DEVICE_INVOICE_CODE = /^[A-Z0-9]{2}$/;
export const INVOICE_SEQ_DIGITS = 6;

/** Indian financial year (Apr–Mar) as "2627" for 2026-04-01 … 2027-03-31. */
export function financialYear(date: Date, timeZone = "Asia/Kolkata"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const start = month >= 4 ? year : year - 1;
  return `${String(start % 100).padStart(2, "0")}${String((start + 1) % 100).padStart(2, "0")}`;
}

export function formatInvoiceNumber(
  outletCode: string,
  fy: string,
  deviceCode: string,
  seq: number,
): string {
  if (!OUTLET_INVOICE_CODE.test(outletCode))
    throw new RangeError(`bad outlet code "${outletCode}"`);
  if (!DEVICE_INVOICE_CODE.test(deviceCode))
    throw new RangeError(`bad device code "${deviceCode}"`);
  if (!/^\d{4}$/.test(fy)) throw new RangeError(`bad financial year "${fy}"`);
  if (!Number.isInteger(seq) || seq < 1 || seq >= 10 ** INVOICE_SEQ_DIGITS) {
    throw new RangeError(`invoice sequence out of range: ${seq}`);
  }
  return `${outletCode}-${fy}-${deviceCode}${String(seq).padStart(INVOICE_SEQ_DIGITS, "0")}`;
}

/** Suggests a 2-char invoice code from a brand name: "Saffron Table" → "ST", "Annapurna" → "AN". */
export function suggestOutletCode(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const first = words[0] ?? "";
  const second = words[1] ?? "";
  if (first && second) return `${first.charAt(0)}${second.charAt(0)}`;
  if (first.length >= 2) return first.slice(0, 2);
  return "A1";
}
