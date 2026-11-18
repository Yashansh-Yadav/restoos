import "server-only";
import { floorSchema } from "@restoos/shared";
import { OUTLET_HEADER } from "@/features/staff/api";
import { apiFetchAsUser } from "@/lib/api-server";

/** First render of /owner/floor; null when signed out. */
export const getOwnerFloor = (outletId: string) =>
  apiFetchAsUser("/api/owner/floor", floorSchema, { [OUTLET_HEADER]: outletId });
