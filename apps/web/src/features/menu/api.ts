import {
  addOnGroupSchema,
  importPreviewSchema,
  importResultSchema,
  menuCategorySchema,
  menuItemSchema,
  ownerMenuSchema,
  type AddOnGroupInput,
  type CategoryInput,
  type ItemInput,
} from "@restoos/shared";
import { z } from "zod";
import { OUTLET_HEADER } from "@/features/staff/api";
import { apiFetch } from "@/lib/api";

// Browser calls for /api/owner/menu (M2-T1).

const opts = (outletId: string, method = "GET", body?: unknown): RequestInit => ({
  method,
  credentials: "same-origin",
  headers: { [OUTLET_HEADER]: outletId },
  ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
});
const id = (v: string) => encodeURIComponent(v);

export const getMenu = (outletId: string) =>
  apiFetch("/api/owner/menu", ownerMenuSchema, opts(outletId));

export const createCategory = (outletId: string, body: CategoryInput) =>
  apiFetch("/api/owner/menu/categories", menuCategorySchema, opts(outletId, "POST", body));
export const updateCategory = (
  outletId: string,
  categoryId: string,
  body: Partial<CategoryInput>,
) =>
  apiFetch(
    `/api/owner/menu/categories/${id(categoryId)}`,
    menuCategorySchema,
    opts(outletId, "PATCH", body),
  );
export const reorderCategories = (outletId: string, ids: string[]) =>
  apiFetch("/api/owner/menu/categories/order", z.undefined(), opts(outletId, "PUT", { ids }));

export const createItem = (outletId: string, body: ItemInput) =>
  apiFetch("/api/owner/menu/items", menuItemSchema, opts(outletId, "POST", body));
export const updateItem = (outletId: string, itemId: string, body: Partial<ItemInput>) =>
  apiFetch(`/api/owner/menu/items/${id(itemId)}`, menuItemSchema, opts(outletId, "PATCH", body));

export function uploadItemImage(outletId: string, itemId: string, file: File) {
  const form = new FormData();
  form.append("image", file);
  return apiFetch(
    `/api/owner/menu/items/${id(itemId)}/image`,
    menuItemSchema,
    opts(outletId, "PUT", form),
  );
}
export const removeItemImage = (outletId: string, itemId: string) =>
  apiFetch(`/api/owner/menu/items/${id(itemId)}/image`, menuItemSchema, opts(outletId, "DELETE"));

export const createAddOnGroup = (outletId: string, body: AddOnGroupInput) =>
  apiFetch("/api/owner/menu/addon-groups", addOnGroupSchema, opts(outletId, "POST", body));
export const updateAddOnGroup = (outletId: string, groupId: string, body: AddOnGroupInput) =>
  apiFetch(
    `/api/owner/menu/addon-groups/${id(groupId)}`,
    addOnGroupSchema,
    opts(outletId, "PUT", body),
  );
export const deleteAddOnGroup = (outletId: string, groupId: string) =>
  apiFetch(`/api/owner/menu/addon-groups/${id(groupId)}`, z.undefined(), opts(outletId, "DELETE"));

// Excel import (M2-T3)
export function uploadMenuImport(outletId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiFetch("/api/owner/menu/import", importPreviewSchema, opts(outletId, "POST", form));
}
export const commitMenuImport = (outletId: string, importId: string, mode: "all" | "validOnly") =>
  apiFetch(
    `/api/owner/menu/import/${id(importId)}/commit`,
    importResultSchema,
    opts(outletId, "POST", { mode }),
  );
