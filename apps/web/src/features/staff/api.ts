import {
  employeeSchema,
  staffListResponseSchema,
  type CreateEmployeeInput,
  type UpdateEmployeeInput,
} from "@restoos/shared";
import { z } from "zod";
import { apiFetch } from "@/lib/api";

// Browser calls for /api/owner/staff (M1-T5). The outlet travels in the x-outlet-id header,
// which the API checks against the owner's organisation.

export const OUTLET_HEADER = "x-outlet-id";

const opts = (outletId: string, init: RequestInit = {}): RequestInit => ({
  ...init,
  credentials: "same-origin",
  headers: { [OUTLET_HEADER]: outletId },
});

export const listStaff = (outletId: string) =>
  apiFetch("/api/owner/staff", staffListResponseSchema, opts(outletId));

export const createEmployee = (outletId: string, body: CreateEmployeeInput) =>
  apiFetch(
    "/api/owner/staff",
    employeeSchema,
    opts(outletId, { method: "POST", body: JSON.stringify(body) }),
  );

export const updateEmployee = (outletId: string, id: string, body: UpdateEmployeeInput) =>
  apiFetch(
    `/api/owner/staff/${encodeURIComponent(id)}`,
    employeeSchema,
    opts(outletId, { method: "PATCH", body: JSON.stringify(body) }),
  );

export const setEmployeePin = (outletId: string, id: string, pin: string) =>
  apiFetch(
    `/api/owner/staff/${encodeURIComponent(id)}/pin`,
    z.undefined(),
    opts(outletId, { method: "PUT", body: JSON.stringify({ pin }) }),
  );
