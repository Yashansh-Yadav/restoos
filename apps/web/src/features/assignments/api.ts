import { assignmentBoardSchema } from "@restoos/shared";
import { z } from "zod";
import { OUTLET_HEADER } from "@/features/staff/api";
import { apiFetch } from "@/lib/api";

// Table assignment (M3-T3). Staff devices send their session cookie; owners add the outlet.

const init = (outletId: string | undefined, method = "GET", body?: unknown): RequestInit => ({
  method,
  credentials: "same-origin",
  headers: outletId ? { [OUTLET_HEADER]: outletId } : {},
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const none = z.undefined();

export const getBoard = (outletId?: string) =>
  apiFetch("/api/staff/assignments", assignmentBoardSchema, init(outletId));

export const assignTable = (tableId: string, employeeId: string | null, outletId?: string) =>
  apiFetch(
    `/api/staff/assignments/tables/${encodeURIComponent(tableId)}`,
    none,
    init(outletId, "PUT", { employeeId }),
  );

export const assignSection = (sectionId: string, employeeId: string, outletId?: string) =>
  apiFetch(
    `/api/staff/assignments/sections/${encodeURIComponent(sectionId)}`,
    none,
    init(outletId, "PUT", { employeeId }),
  );
