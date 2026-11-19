import {
  createdOrderSchema,
  orderDecisionSchema,
  orderPadSchema,
  voidedItemSchema,
  type CreateOrderInput,
  type RejectOrderInput,
  type VoidItemInput,
} from "@restoos/shared";
import { apiFetch } from "@/lib/api";

// Staff ordering (M5-T1). Staff devices send their session cookie.

export const getOrderPad = (tableId: string) =>
  apiFetch(`/api/staff/tables/${encodeURIComponent(tableId)}/order-pad`, orderPadSchema, {
    credentials: "same-origin",
  });

export const sendOrder = (body: CreateOrderInput) =>
  apiFetch("/api/staff/orders", createdOrderSchema, {
    method: "POST",
    credentials: "same-origin",
    body: JSON.stringify(body),
  });

/** M5-T5: managers/owners void a sent item (or some of it) with a reason. */
export const voidOrderItem = (itemId: string, body: VoidItemInput) =>
  apiFetch(`/api/staff/order-items/${encodeURIComponent(itemId)}/void`, voidedItemSchema, {
    method: "POST",
    credentials: "same-origin",
    body: JSON.stringify(body),
  });

/** M5-T6b: a guest order from the QR menu → OPEN + KOT. */
export const approveOrder = (orderId: string) =>
  apiFetch(`/api/staff/orders/${encodeURIComponent(orderId)}/approve`, orderDecisionSchema, {
    method: "POST",
    credentials: "same-origin",
  });

/** M5-T6b: turn a guest order down (the guest sees the reason). */
export const rejectOrder = (orderId: string, body: RejectOrderInput) =>
  apiFetch(`/api/staff/orders/${encodeURIComponent(orderId)}/reject`, orderDecisionSchema, {
    method: "POST",
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
