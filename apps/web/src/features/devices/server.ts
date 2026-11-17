import "server-only";
import { deviceListResponseSchema } from "@restoos/shared";
import { OUTLET_HEADER } from "@/features/staff/api";
import { apiFetchAsUser } from "@/lib/api-server";

/** First render of /owner/devices; null when signed out. */
export function getDevices(outletId: string) {
  return apiFetchAsUser("/api/owner/devices", deviceListResponseSchema, {
    [OUTLET_HEADER]: outletId,
  });
}
