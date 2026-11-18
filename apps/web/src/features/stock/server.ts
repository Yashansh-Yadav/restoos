import "server-only";
import { stockListSchema } from "@restoos/shared";
import { apiFetchAsUser } from "@/lib/api-server";

/** First render of /staff/stock (staff device session); null when signed out. */
export const getStockForStaff = () => apiFetchAsUser("/api/staff/menu/stock", stockListSchema);
