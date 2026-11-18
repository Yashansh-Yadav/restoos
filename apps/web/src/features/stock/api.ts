import { stockListSchema, stockUpdateResponseSchema } from "@restoos/shared";
import { OUTLET_HEADER } from "@/features/staff/api";
import { apiFetch } from "@/lib/api";

// One-tap stock toggle (M2-T4). Staff devices send their session cookie; owners add the outlet.

const headers = (outletId?: string): HeadersInit => (outletId ? { [OUTLET_HEADER]: outletId } : {});

export const getStock = (outletId?: string) =>
  apiFetch("/api/staff/menu/stock", stockListSchema, {
    credentials: "same-origin",
    headers: headers(outletId),
  });

export const setStock = (itemId: string, inStock: boolean, outletId?: string) =>
  apiFetch(`/api/staff/menu/items/${encodeURIComponent(itemId)}/stock`, stockUpdateResponseSchema, {
    method: "PUT",
    credentials: "same-origin",
    headers: headers(outletId),
    body: JSON.stringify({ inStock }),
  });
