import "server-only";
import { ownerMenuSchema } from "@restoos/shared";
import { OUTLET_HEADER } from "@/features/staff/api";
import { apiFetchAsUser } from "@/lib/api-server";

/** First render of /owner/menu; null when signed out. */
export const getOwnerMenu = (outletId: string) =>
  apiFetchAsUser("/api/owner/menu", ownerMenuSchema, { [OUTLET_HEADER]: outletId });
