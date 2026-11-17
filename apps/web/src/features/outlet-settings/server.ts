import "server-only";
import { outletSettingsSchema } from "@restoos/shared";
import { OUTLET_HEADER } from "@/features/staff/api";
import { apiFetchAsUser } from "@/lib/api-server";

/** The outlet's settings for a Server Component; null when signed out. */
export const getOutletSettings = (outletId: string) =>
  apiFetchAsUser("/api/owner/outlet/settings", outletSettingsSchema, {
    [OUTLET_HEADER]: outletId,
  });
