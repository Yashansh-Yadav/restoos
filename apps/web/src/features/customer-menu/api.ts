import {
  guestOrderResultSchema,
  publicMenuSchema,
  tableOrdersSchema,
  type GuestOrderInput,
} from "@restoos/shared";
import { apiFetch } from "@/lib/api";

// Customer menu (M5-T6a): public, no login — the table's QR token is the only key.
export const getPublicMenu = (qrToken: string) =>
  apiFetch(`/api/public/table/${encodeURIComponent(qrToken)}`, publicMenuSchema, {
    cache: "no-store",
  });

/** M5-T6b: place a guest order (idempotent on clientId). */
export const placeGuestOrder = (qrToken: string, body: GuestOrderInput) =>
  apiFetch(`/api/public/table/${encodeURIComponent(qrToken)}/order`, guestOrderResultSchema, {
    method: "POST",
    body: JSON.stringify(body),
  });

/** M5-T6b: this sitting's guest orders and their status. */
export const getTableOrders = (qrToken: string) =>
  apiFetch(`/api/public/table/${encodeURIComponent(qrToken)}/orders`, tableOrdersSchema, {
    cache: "no-store",
  });
