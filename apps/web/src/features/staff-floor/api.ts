import { staffFloorSchema, tableStatusSchema, type ManualTableEvent } from "@restoos/shared";
import { z } from "zod";
import { OUTLET_HEADER } from "@/features/staff/api";
import { apiFetch } from "@/lib/api";

// Staff floor view (M3-T4). Staff devices send their session cookie; owners add the outlet.

const headers = (outletId?: string): HeadersInit => (outletId ? { [OUTLET_HEADER]: outletId } : {});

export const getStaffFloor = (outletId?: string) =>
  apiFetch("/api/staff/floor", staffFloorSchema, {
    credentials: "same-origin",
    headers: headers(outletId),
  });

export const changeTableStatus = (tableId: string, event: ManualTableEvent, outletId?: string) =>
  apiFetch(
    `/api/staff/tables/${encodeURIComponent(tableId)}/status`,
    z.object({ id: z.string(), label: z.string(), status: tableStatusSchema }),
    {
      method: "POST",
      credentials: "same-origin",
      headers: headers(outletId),
      body: JSON.stringify({ event }),
    },
  );
