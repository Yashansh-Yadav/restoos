import "server-only";
import { orderPadSchema } from "@restoos/shared";
import { apiFetchAsUser } from "@/lib/api-server";

/** First render of /staff/tables/[id]; null when signed out. */
export const getOrderPadForStaff = (tableId: string) =>
  apiFetchAsUser(`/api/staff/tables/${encodeURIComponent(tableId)}/order-pad`, orderPadSchema);
