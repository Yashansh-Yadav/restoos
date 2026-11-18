import { floorSchema, floorSectionSchema, floorTableSchema } from "@restoos/shared";
import { z } from "zod";
import { OUTLET_HEADER } from "@/features/staff/api";
import { apiFetch } from "@/lib/api";

// Browser calls for /api/owner/floor (M3-T1).

const opts = (outletId: string, method = "GET", body?: unknown): RequestInit => ({
  method,
  credentials: "same-origin",
  headers: { [OUTLET_HEADER]: outletId },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const id = (v: string) => encodeURIComponent(v);
const none = z.undefined();

export const getFloor = (outletId: string) =>
  apiFetch("/api/owner/floor", floorSchema, opts(outletId));

export const createSection = (outletId: string, name: string) =>
  apiFetch("/api/owner/floor/sections", floorSectionSchema, opts(outletId, "POST", { name }));
export const renameSection = (outletId: string, sectionId: string, name: string) =>
  apiFetch(`/api/owner/floor/sections/${id(sectionId)}`, none, opts(outletId, "PATCH", { name }));
export const reorderSections = (outletId: string, ids: string[]) =>
  apiFetch("/api/owner/floor/sections/order", none, opts(outletId, "PUT", { ids }));
export const deleteSection = (outletId: string, sectionId: string) =>
  apiFetch(`/api/owner/floor/sections/${id(sectionId)}`, none, opts(outletId, "DELETE"));

export const createTable = (
  outletId: string,
  body: { sectionId: string; label: string; seats: number },
) => apiFetch("/api/owner/floor/tables", floorTableSchema, opts(outletId, "POST", body));
export const bulkCreateTables = (
  outletId: string,
  body: { sectionId: string; prefix: string; from: string; to: number; seats: number },
) =>
  apiFetch(
    "/api/owner/floor/tables/bulk",
    z.object({ tables: z.array(floorTableSchema) }),
    opts(outletId, "POST", body),
  );
export const updateTable = (
  outletId: string,
  tableId: string,
  body: Partial<{ sectionId: string; label: string; seats: number; posX: number; posY: number }>,
) =>
  apiFetch(
    `/api/owner/floor/tables/${id(tableId)}`,
    floorTableSchema,
    opts(outletId, "PATCH", body),
  );
export const saveLayout = (
  outletId: string,
  tables: { id: string; sectionId: string; posX: number; posY: number }[],
) => apiFetch("/api/owner/floor/layout", none, opts(outletId, "PUT", { tables }));
export const deleteTable = (outletId: string, tableId: string) =>
  apiFetch(`/api/owner/floor/tables/${id(tableId)}`, none, opts(outletId, "DELETE"));

// QR codes (M3-T2). The PDF is a plain download link (cookies + ?outletId=, like the menu Excel).
export const rotateQr = (outletId: string, tableId: string) =>
  apiFetch(
    `/api/owner/floor/tables/${id(tableId)}/rotate-qr`,
    floorTableSchema,
    opts(outletId, "POST"),
  );
export const qrCardsHref = (
  outletId: string,
  only: { sectionId?: string; tableId?: string } = {},
) => {
  const q = new URLSearchParams({ outletId, ...only });
  return `/api/owner/floor/qr-cards.pdf?${q.toString()}`;
};
