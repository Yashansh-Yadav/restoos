import { z } from "zod";
import {
  dietTypeSchema,
  orderingModeSchema,
  orderItemStatusSchema,
  tableStatusSchema,
} from "../enums";

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
  /** The kitchen ticket for this send (M5-T2): the day's KOT number. */
  kot: z.object({ id: z.string(), number: z.number().int() }).nullable(),
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
  /** Why it was voided (M5-T5); null unless status is VOIDED. */
  voidReason: z.string().nullable(),
});
export type SentLine = z.infer<typeof sentLineSchema>;

/** A guest order on the staff order screen, waiting for Approve & Send. */
export const pendingOrderSchema = z.object({
  id: z.string(),
  createdAt: z.iso.datetime(),
  lines: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      quantity: z.number().int(),
      unitPrice: z.number().int(),
      taxRateBps: z.number().int(),
      note: z.string().nullable(),
      addOns: z.array(z.string()),
    }),
  ),
});
export type PendingOrder = z.infer<typeof pendingOrderSchema>;

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
  /** Items already sent for the guests at this table now (open session), voided ones included. */
  sent: z.array(sentLineSchema),
  /** Guest orders from the QR menu waiting for staff (M5-T6b), oldest first. */
  pending: z.array(pendingOrderSchema),
});
export type OrderPad = z.infer<typeof orderPadSchema>;

// ── Void (M5-T5) ────────────────────────────────────────────────────────────

/** One-tap reasons on the void sheet; anything else is typed under "Other". */
export const VOID_REASONS = [
  "Guest changed mind",
  "Wrong item entered",
  "Out of stock",
  "Quality issue",
] as const;

export const voidItemInputSchema = z
  .object({
    /** How many of the line to void (a partial void splits the line). */
    quantity: z.number().int().min(1, "At least 1").max(99),
    /** The quantity the manager saw: if the line changed since, the void is refused. */
    fromQuantity: z.number().int().min(1).max(99),
    reason: z
      .string()
      .trim()
      .min(1, "Give a reason")
      .max(200, "Keep the reason under 200 characters"),
  })
  .refine((v) => v.quantity <= v.fromQuantity, {
    message: "Can't void more than the line has",
    path: ["quantity"],
  });
export type VoidItemInput = z.input<typeof voidItemInputSchema>;

export const voidedItemSchema = z.object({
  /** The VOIDED line (the original on a whole-line void, a new split line otherwise). */
  id: z.string(),
  quantity: z.number().int(),
  /** What's left active on the original line (0 for a whole-line void). */
  remaining: z.number().int(),
});
export type VoidedItem = z.infer<typeof voidedItemSchema>;

// ── Guest ordering (M5-T6b) ─────────────────────────────────────────────────

/** POST /api/public/table/:qrToken/order — same lines as a staff send, fewer per order. */
export const guestOrderInputSchema = z.object({
  clientId: clientIdSchema,
  items: z.array(orderLineInputSchema).min(1, "Add at least one item").max(30),
});
export type GuestOrderInput = z.input<typeof guestOrderInputSchema>;

export const guestOrderResultSchema = z.object({
  id: z.string(),
  /** PENDING_APPROVAL (staff will confirm) or OPEN (sent straight to the kitchen). */
  status: z.enum(["PENDING_APPROVAL", "OPEN"]),
  /** False when this clientId was already placed (a retry). */
  created: z.boolean(),
});
export type GuestOrderResult = z.infer<typeof guestOrderResultSchema>;

/** What a guest sees about their table's orders this sitting (no prices, no staff names). */
export const guestOrderStateSchema = z.enum(["WAITING", "SENT", "NOT_ACCEPTED"]);
export type GuestOrderState = z.infer<typeof guestOrderStateSchema>;

export const tableOrdersSchema = z.object({
  orderingMode: orderingModeSchema,
  orders: z.array(
    z.object({
      id: z.string(),
      createdAt: z.iso.datetime(),
      state: guestOrderStateSchema,
      /** Why staff didn't accept it (NOT_ACCEPTED only). */
      reason: z.string().nullable(),
      items: z.array(
        z.object({ name: z.string(), quantity: z.number().int(), addOns: z.array(z.string()) }),
      ),
    }),
  ),
});
export type TableOrders = z.infer<typeof tableOrdersSchema>;

/** One-tap reasons when staff turn a guest order down; free text otherwise. */
export const REJECT_REASONS = ["Item not available", "Please order with the staff"] as const;

export const rejectOrderSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(120, "Keep the reason under 120 characters")
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type RejectOrderInput = z.input<typeof rejectOrderSchema>;

export const orderDecisionSchema = z.object({
  id: z.string(),
  status: z.enum(["OPEN", "CANCELLED"]),
  kot: z.object({ id: z.string(), number: z.number().int() }).nullable(),
});
export type OrderDecision = z.infer<typeof orderDecisionSchema>;
