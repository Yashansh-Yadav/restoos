import type { DietType } from "./enums";
import { DEFAULT_HSN_SAC, GST_RATES_BPS, MAX_VARIANTS } from "./menu";
import { parseRupees } from "./money";

// The Excel menu contract (M2-T2 template / export, M2-T3 import). One definition so the file we
// hand out and the importer that reads it back can never disagree.

export const MENU_SHEET = "Menu";
export const INSTRUCTIONS_SHEET = "Instructions";

export const DIET_LABELS: Record<DietType, string> = { VEG: "Veg", NON_VEG: "Non-veg", EGG: "Egg" };
export const YES_NO = ["Yes", "No"] as const;
/** "0", "5", "18", "40" — what the GST % dropdown offers. */
export const GST_PERCENT_OPTIONS = GST_RATES_BPS.map((bps) => String(bps / 100));

export type MenuImportColumn = {
  key:
    | "category"
    | "categoryHi"
    | "name"
    | "nameHi"
    | "code"
    | "diet"
    | "price"
    | "sizes"
    | "gst"
    | "hsnSac"
    | "description"
    | "show";
  header: string;
  required: boolean;
  width: number;
  help: string;
};

export const MENU_IMPORT_COLUMNS: readonly MenuImportColumn[] = [
  {
    key: "category",
    header: "Category",
    required: true,
    width: 18,
    help: "e.g. Starters. New categories are created.",
  },
  {
    key: "categoryHi",
    header: "Category (Hindi)",
    required: false,
    width: 18,
    help: "Optional Hindi name of the category.",
  },
  {
    key: "name",
    header: "Item Name",
    required: true,
    width: 28,
    help: "As it should appear on the menu and bill.",
  },
  {
    key: "nameHi",
    header: "Item Name (Hindi)",
    required: false,
    width: 24,
    help: "Optional, shown with the Hindi menu toggle.",
  },
  {
    key: "code",
    header: "Item Code",
    required: false,
    width: 12,
    help: "Up to 10 letters/digits. Importing again with the same code UPDATES that item.",
  },
  {
    key: "diet",
    header: "Type",
    required: true,
    width: 10,
    help: "Veg, Non-veg or Egg (pick from the list).",
  },
  {
    key: "price",
    header: "Price (₹)",
    required: true,
    width: 11,
    help: "In rupees, e.g. 220 or 220.50. Leave empty if you fill Sizes.",
  },
  {
    key: "sizes",
    header: "Sizes",
    required: false,
    width: 24,
    help: "Optional: name=price pairs, e.g. Half=140, Full=220",
  },
  {
    key: "gst",
    header: "GST %",
    required: true,
    width: 8,
    help: "0, 5, 18 or 40. Restaurant food is usually 5.",
  },
  {
    key: "hsnSac",
    header: "HSN/SAC",
    required: false,
    width: 11,
    help: `Optional. Default ${DEFAULT_HSN_SAC} (restaurant service).`,
  },
  {
    key: "description",
    header: "Description",
    required: false,
    width: 36,
    help: "Optional, up to 300 characters.",
  },
  {
    key: "show",
    header: "Show on Menu",
    required: false,
    width: 13,
    help: "Yes or No. Empty means Yes.",
  },
];

export type MenuSheetRow = Record<MenuImportColumn["key"], string>;

/** Rows the template ships with, so owners see the format. */
export const MENU_TEMPLATE_EXAMPLES: readonly MenuSheetRow[] = [
  {
    category: "Starters",
    categoryHi: "स्टार्टर",
    name: "Paneer Tikka",
    nameHi: "पनीर टिक्का",
    code: "ST1",
    diet: "Veg",
    price: "",
    sizes: "Half=140, Full=220",
    gst: "5",
    hsnSac: DEFAULT_HSN_SAC,
    description: "Cottage cheese, charcoal-grilled with spices",
    show: "Yes",
  },
  {
    category: "Mains",
    categoryHi: "मुख्य व्यंजन",
    name: "Butter Chicken",
    nameHi: "बटर चिकन",
    code: "MN1",
    diet: "Non-veg",
    price: "320",
    sizes: "",
    gst: "5",
    hsnSac: DEFAULT_HSN_SAC,
    description: "",
    show: "Yes",
  },
  {
    category: "Drinks",
    categoryHi: "पेय",
    name: "Packaged Water (1 L)",
    nameHi: "",
    code: "DR1",
    diet: "Veg",
    price: "40",
    sizes: "",
    gst: "18",
    hsnSac: "2201",
    description: "",
    show: "Yes",
  },
];

/** Paise → "140" or "140.50" (how prices are written in the sheet). */
export const rupeesText = (paise: number) =>
  paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);

/** [{ name: "Half", price: 14000 }] → "Half=140, Full=220". */
export const formatSizes = (sizes: readonly { name: string; price: number }[]) =>
  sizes.map((s) => `${s.name}=${rupeesText(s.price)}`).join(", ");

export type ParsedSizes =
  { ok: true; sizes: { name: string; price: number }[] } | { ok: false; error: string };

/** "Half=140, Full=220" → sizes in paise. Empty → no sizes. Errors say how to fix the cell. */
export function parseSizes(input: string): ParsedSizes {
  const text = input.trim();
  if (text === "") return { ok: true, sizes: [] };
  const sizes: { name: string; price: number }[] = [];
  for (const part of text
    .split(/[,;\n]/)
    .map((p) => p.trim())
    .filter(Boolean)) {
    const eq = part.indexOf("=");
    if (eq <= 0) {
      return { ok: false, error: `"${part}" should look like Half=140` };
    }
    const name = part.slice(0, eq).trim();
    let price: number;
    try {
      price = parseRupees(part.slice(eq + 1));
    } catch {
      return { ok: false, error: `"${part}": the price after = should be a number, e.g. 140` };
    }
    if (price <= 0) return { ok: false, error: `"${part}": the price must be more than 0` };
    if (sizes.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      return { ok: false, error: `Size "${name}" appears twice` };
    }
    sizes.push({ name, price });
  }
  if (sizes.length > MAX_VARIANTS) return { ok: false, error: `At most ${MAX_VARIANTS} sizes` };
  return { ok: true, sizes };
}
