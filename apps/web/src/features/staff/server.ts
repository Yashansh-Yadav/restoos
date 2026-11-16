import "server-only";
import { staffListResponseSchema, type StaffList } from "@restoos/shared";
import { apiFetchAsUser } from "@/lib/api-server";
import { OUTLET_HEADER } from "./api";

/** First render of /owner/staff (Server Component); null when signed out. */
export function getStaff(outletId: string): Promise<StaffList | null> {
  return apiFetchAsUser("/api/owner/staff", staffListResponseSchema, { [OUTLET_HEADER]: outletId });
}
