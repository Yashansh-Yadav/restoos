import { outletSettingsSchema, type OutletSettings } from "@restoos/shared";
import { OUTLET_HEADER } from "@/features/staff/api";
import { apiFetch } from "@/lib/api";

/** PATCH /api/owner/outlet/settings (M1-T7). */
export const updateOutletSettings = (outletId: string, body: Partial<OutletSettings>) =>
  apiFetch("/api/owner/outlet/settings", outletSettingsSchema, {
    method: "PATCH",
    body: JSON.stringify(body),
    credentials: "same-origin",
    headers: { [OUTLET_HEADER]: outletId },
  });
