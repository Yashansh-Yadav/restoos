import { createdOrderSchema, orderPadSchema, type CreateOrderInput } from "@restoos/shared";
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
