import { z } from "zod";
import { dietTypeSchema, orderItemStatusSchema, tableStatusSchema } from "../enums";

// Staff ordering (M5-T1): the order pad for one table, and a "Send to kitchen" request.

/** Device-made idempotency key for one send (rule 8): a retry with the same key is a no-op. */
export const clientIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, "clientId must be 8–64 letters, digits, _ or -");

export const orderLineInputSchema = z.object({
  itemId: z.string().min(1),
  variantId: z.string().min(1).nullish(),
  addOnIds: z.array(z.string().min(1)).max(20).default([]),
  quantity: z.number().int().min(1, "At least 1").max(99, "At most 99"),
  note: z
    .string()
    .trim()
    .max(120, "Keep the note under 120 characters")
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type OrderLineInput = z.input<typeof orderLineInputSchema>;

export const createOrderSchema = z.object({
  clientId: clientIdSchema,
  tableId: z.string().min(1),
  items: z.array(orderLineInputSchema).min(1, "Add at least one item").max(100),
});
export type CreateOrderInput = z.input<typeof createOrderSchema>;

export const createdOrderSchema = z.object({
  id: z.string(),
  tableId: z.string(),
  itemCount: z.number().int(),
  /** False when this clientId had already been sent (nothing new was created). */
  created: z.boolean(),
});
export type CreatedOrder = z.infer<typeof createdOrderSchema>;

// ── Order pad ───────────────────────────────────────────────────────────────

export const padItemSchema = z.object({
  id: z.string(),
  code: z.string().nullable(),
  name: z.string(),
  dietType: dietTypeSchema,
  /** One unit without sizes, or the base price; sizes carry their own price. */
  basePrice: z.number().int(),
  taxRateBps: z.number().int(),
  inStock: z.boolean(),
  variants: z.array(z.object({ id: z.string(), name: z.string(), price: z.number().int() })),
  addOnGroupIds: z.array(z.string()),
});
export type PadItem = z.infer<typeof padItemSchema>;

export const padAddOnGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  minSelect: z.number().int(),
  maxSelect: z.number().int(),
  addOns: z.array(z.object({ id: z.string(), name: z.string(), price: z.number().int() })),
});
export type PadAddOnGroup = z.infer<typeof padAddOnGroupSchema>;

export const sentLineSchema = z.object({
  id: z.string(),
  name: z.string(),
  quantity: z.number().int(),
  unitPrice: z.number().int(),
  taxRateBps: z.number().int(),
  note: z.string().nullable(),
  addOns: z.array(z.string()),
  status: orderItemStatusSchema,
});
export type SentLine = z.infer<typeof sentLineSchema>;

export const orderPadSchema = z.object({
  table: z.object({
    id: z.string(),
    label: z.string(),
    status: tableStatusSchema,
    butlerName: z.string().nullable(),
  }),
  pricing: z.object({ pricesIncludeTax: z.boolean() }),
  categories: z.array(
    z.object({ id: z.string(), name: z.string(), items: z.array(padItemSchema) }),
  ),
  addOnGroups: z.array(padAddOnGroupSchema),
  /** Most-ordered items lately (or the first on the menu), for the Popular tab. */
  topItemIds: z.array(z.string()),
  /** Items already sent for the guests at this table now (open session), voids excluded. */
  sent: z.array(sentLineSchema),
});
export type OrderPad = z.infer<typeof orderPadSchema>;
