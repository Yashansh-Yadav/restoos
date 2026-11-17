import { z } from "zod";
import { dietTypeSchema } from "../enums";
import { GST_RATES_BPS, MAX_ADDONS_PER_GROUP, MAX_VARIANTS } from "../menu";

// Menu editing (M2-T1). Same schemas validate the web forms and the API (rule 10).

const optionalText = (max: number, label: string) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(max, `${label} can be at most ${max} characters`).nullable().optional(),
  );

const name = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${label.toLowerCase()}`)
    .max(max, `${label} can be at most ${max} characters`);

/** Paise, a positive whole number (the web converts "₹ 120.50" with parseRupees). */
const price = z
  .number({ error: "Enter a price" })
  .int("Price must be in whole paise")
  .positive("Price must be more than ₹0")
  .max(10_00_000_00, "Price looks too high");
const nonNegativePrice = z.number().int().min(0, "Price can't be negative").max(10_00_000_00);

export const gstRateSchema = z
  .number()
  .refine(
    (r) => (GST_RATES_BPS as readonly number[]).includes(r),
    "Choose a GST rate: 0, 5, 18 or 40 %",
  );

export const dietTypeInputSchema = z.enum(dietTypeSchema.options, {
  error: "Choose veg, non-veg or egg",
});

// ── Categories ──────────────────────────────────────────────────────────────

const categoryFields = {
  name: name(40, "Category name"),
  nameHi: optionalText(40, "Hindi name"),
  isActive: z.boolean(),
};
export const categoryInputSchema = z.object({
  ...categoryFields,
  isActive: categoryFields.isActive.default(true),
});
// Built from the fields without defaults: in zod 4 `.partial()` keeps defaults, so an update that
// omits a field would silently reset it.
export const categoryUpdateSchema = z.object(categoryFields).partial();
export const categoryOrderSchema = z.object({ ids: z.array(z.string().min(1)).min(1) });
export type CategoryInput = z.input<typeof categoryInputSchema>;

// ── Add-on groups ───────────────────────────────────────────────────────────

export const addOnInputSchema = z.object({
  name: name(40, "Add-on name"),
  price: nonNegativePrice,
});

export const addOnGroupInputSchema = z
  .object({
    name: name(40, "Group name"),
    minSelect: z.number().int().min(0).max(MAX_ADDONS_PER_GROUP),
    maxSelect: z.number().int().min(1, "Allow at least 1").max(MAX_ADDONS_PER_GROUP),
    addOns: z
      .array(addOnInputSchema)
      .min(1, "Add at least one add-on")
      .max(MAX_ADDONS_PER_GROUP, `At most ${MAX_ADDONS_PER_GROUP} add-ons`),
  })
  .refine((g) => g.minSelect <= g.maxSelect, {
    path: ["minSelect"],
    message: '"At least" can\'t be more than "at most"',
  })
  .refine((g) => g.maxSelect <= g.addOns.length, {
    path: ["maxSelect"],
    message: '"At most" can\'t be more than the number of add-ons',
  });
export type AddOnGroupInput = z.input<typeof addOnGroupInputSchema>;

// ── Items ───────────────────────────────────────────────────────────────────

export const variantInputSchema = z.object({
  name: name(30, "Size name"),
  price,
});

const itemFields = {
  categoryId: z.string().min(1, "Choose a category"),
  name: name(80, "Item name"),
  nameHi: optionalText(80, "Hindi name"),
  description: optionalText(300, "Description"),
  code: z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim().toUpperCase()) : v),
    z
      .string()
      .regex(/^[A-Z0-9]{1,10}$/, "Item code: up to 10 letters or digits")
      .nullable()
      .optional(),
  ),
  hsnSac: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z
      .string()
      .trim()
      .regex(/^\d{4,8}$/, "HSN/SAC is 4 to 8 digits")
      .nullable()
      .optional(),
  ),
  dietType: dietTypeInputSchema,
  basePrice: price,
  taxRateBps: gstRateSchema,
  isActive: z.boolean(),
  /** Sizes (Half/Full…). When present, the size prices are what's charged. */
  variants: z
    .array(variantInputSchema)
    .max(MAX_VARIANTS, `At most ${MAX_VARIANTS} sizes`)
    .refine(
      (v) => new Set(v.map((x) => x.name.toLowerCase())).size === v.length,
      "Size names must be different",
    ),
  addOnGroupIds: z.array(z.string().min(1)).max(10),
};

export const itemInputSchema = z.object({
  ...itemFields,
  isActive: itemFields.isActive.default(true),
  variants: itemFields.variants.default([]),
  addOnGroupIds: itemFields.addOnGroupIds.default([]),
});
// No defaults here (see categoryUpdateSchema): omitted = unchanged.
export const itemUpdateSchema = z.object(itemFields).partial();
export type ItemInput = z.input<typeof itemInputSchema>;

// ── Responses ───────────────────────────────────────────────────────────────

export const menuItemSchema = z.object({
  id: z.string(),
  categoryId: z.string(),
  name: z.string(),
  nameHi: z.string().nullable(),
  description: z.string().nullable(),
  code: z.string().nullable(),
  hsnSac: z.string().nullable(),
  dietType: dietTypeSchema,
  basePrice: z.number().int(),
  taxRateBps: z.number().int(),
  imageUrl: z.string().nullable(),
  inStock: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  variants: z.array(z.object({ id: z.string(), name: z.string(), price: z.number().int() })),
  addOnGroupIds: z.array(z.string()),
});
export type MenuItem = z.infer<typeof menuItemSchema>;

export const menuCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  nameHi: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});
export type MenuCategory = z.infer<typeof menuCategorySchema>;

export const addOnGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  minSelect: z.number().int(),
  maxSelect: z.number().int(),
  addOns: z.array(z.object({ id: z.string(), name: z.string(), price: z.number().int() })),
});
export type AddOnGroup = z.infer<typeof addOnGroupSchema>;

/** GET /api/owner/menu — the whole outlet menu (owner view, hidden items included). */
export const ownerMenuSchema = z.object({
  categories: z.array(menuCategorySchema),
  items: z.array(menuItemSchema),
  addOnGroups: z.array(addOnGroupSchema),
});
export type OwnerMenu = z.infer<typeof ownerMenuSchema>;
